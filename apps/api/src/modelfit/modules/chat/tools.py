import contextlib
import json
import re
from pathlib import Path
from typing import Any

import structlog
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from modelfit.core.errors import AppError
from modelfit.modules.catalog.service import CatalogService
from modelfit.modules.estimator.schemas import (
    EstimationConfig,
    HardwareKind,
    HardwareProfileInput,
    QuantizationFormat,
)
from modelfit.modules.hardware.schemas import EstimateRequest
from modelfit.modules.hardware.service import HardwareService
from modelfit.modules.recommend.schemas import RequirementSpec
from modelfit.modules.recommend.service import RecommendService

logger = structlog.get_logger(__name__)


def _load_hardware_presets() -> list[dict[str, Any]]:
    preset_path = (
        Path(__file__).resolve().parent.parent / "hardware" / "seeds" / "hardware_presets.json"
    )
    if preset_path.exists():
        with open(preset_path, encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                return data
    return []


def _extract_gb(text: str) -> int | None:
    match = re.search(r"\b(\d+)\s*(?:gb|g)\b", text, re.IGNORECASE)
    return int(match.group(1)) if match else None


def _match_hardware_profile(
    query: str, profiles: list[Any]
) -> tuple[HardwareProfileInput | None, list[str]]:
    """Exact or unambiguous hardware profile matching.

    - Apple/Unified memory: requires an explicit GB amount.
      If no GB amount is given, returns (None, []).
      Matches preset if available; otherwise builds a user-provided profile with assumptions.
    - Discrete GPUs: matches exact or unambiguous preset. System RAM alone returns (None, []).
    """
    assumptions: list[str] = []
    q_lower = query.lower()

    # Check for Apple Silicon / Unified Memory
    is_apple_unified = bool(
        re.search(r"\b(apple|mac|macbook|m1|m2|m3|m4|unified)\b", q_lower)
    )
    if is_apple_unified:
        gb = _extract_gb(query)
        if not gb or gb <= 0:
            # "Apple Silicon" with no GB figure -> clarification, no guess
            return None, []

        # Check if an existing preset matches this GB figure and is apple_unified
        for p in profiles:
            p_name = p.name if hasattr(p, "name") else p.get("name", "")
            p_kind = p.kind if hasattr(p, "kind") else p.get("kind", "")
            p_bytes = p.memory_bytes if hasattr(p, "memory_bytes") else p.get("memory_bytes", 0)
            p_res = (
                p.reserved_memory_bytes
                if hasattr(p, "reserved_memory_bytes")
                else p.get("reserved_memory_bytes", 0)
            )
            if p_kind == "apple_unified" and round(p_bytes / (1024**3)) == gb:
                hw = HardwareProfileInput(
                    name=p_name,
                    memory_bytes=p_bytes,
                    kind=HardwareKind.APPLE_UNIFIED,
                    reserved_memory_bytes=p_res,
                )
                return hw, []

        # For amounts without a preset (e.g. 24, 64, 128GB), build a profile only
        # from the user's explicit number, and state in assumptions that it is user-provided.
        total_bytes = int(gb * (1024**3))
        reserved_bytes = int(total_bytes * 0.20)  # Standard 20% reserved for macOS/display
        hw = HardwareProfileInput(
            name=f"Apple Mac {gb}GB Unified (User-provided)",
            memory_bytes=total_bytes,
            kind=HardwareKind.APPLE_UNIFIED,
            reserved_memory_bytes=reserved_bytes,
        )
        assumptions.append(
            f"Apple Silicon Unified Memory capacity ({gb}GB) is user-provided "
            "with standard 20% system reservation."
        )
        return hw, assumptions

    # Check for explicit VRAM request (e.g. "16GB VRAM")
    if re.search(r"\b\d+\s*gb\s+vram\b", q_lower):
        gb = _extract_gb(query)
        if gb and gb > 0:
            total_bytes = int(gb * (1024**3))
            hw = HardwareProfileInput(
                name=f"Custom {gb}GB VRAM (User-provided)",
                memory_bytes=total_bytes,
                kind=HardwareKind.GPU,
                reserved_memory_bytes=int(total_bytes * 0.05),
            )
            assumptions.append(f"GPU VRAM capacity ({gb}GB) is user-provided.")
            return hw, assumptions

    # Discrete GPU matching: strip system RAM tokens
    cleaned = re.sub(r"(?i)\b\d+\s*gb\s+(?:system\s+)?ram\b", "", query).strip()
    q_norm = " ".join(cleaned.lower().split())
    if not q_norm:
        # User only specified system RAM -> clarification, never treat RAM as VRAM
        return None, []

    matches = []
    for p in profiles:
        p_name = p.name if hasattr(p, "name") else p.get("name", "")
        p_kind = p.kind if hasattr(p, "kind") else p.get("kind", "")
        p_bytes = p.memory_bytes if hasattr(p, "memory_bytes") else p.get("memory_bytes", 0)
        p_res = (
            p.reserved_memory_bytes
            if hasattr(p, "reserved_memory_bytes")
            else p.get("reserved_memory_bytes", 0)
        )

        p_norm = " ".join(p_name.lower().split())
        p_stripped = p_norm.replace("nvidia", "").replace("geforce", "").strip()
        q_stripped = q_norm.replace("nvidia", "").replace("geforce", "").strip()

        # Exact match
        if q_norm == p_norm or q_stripped == p_stripped:
            matches.append((p, p_name, p_kind, p_bytes, p_res))
            continue

        # Exact word-boundary match
        pattern = rf"\b{re.escape(q_stripped)}\b"
        if re.search(pattern, p_stripped):
            extra = re.sub(pattern, "", p_stripped).strip()
            if not any(v in extra.split() for v in ("ti", "super", "d", "xt", "xtx")):
                matches.append((p, p_name, p_kind, p_bytes, p_res))

    if len(matches) == 1:
        _, m_name, m_kind, m_bytes, m_res = matches[0]
        kind_val = HardwareKind.GPU
        with contextlib.suppress(ValueError):
            kind_val = HardwareKind(m_kind)
        hw = HardwareProfileInput(
            name=m_name,
            memory_bytes=m_bytes,
            kind=kind_val,
            reserved_memory_bytes=m_res,
        )
        return hw, []

    return None, []


# Tool Schemas for Gemini function calling
class SearchModelsArgs(BaseModel):
    query: str = Field(description="Search terms for finding models on Hugging Face Hub.")
    limit: int = Field(default=10, ge=1, le=50, description="Maximum number of models to return.")


class GetModelDetailsArgs(BaseModel):
    repo_id: str = Field(
        description="The full repository ID on Hugging Face (e.g. 'meta-llama/Meta-Llama-3-8B')."
    )


class EstimateMemoryArgs(BaseModel):
    repo_id: str = Field(description="Hugging Face repo ID of the model.")
    hardware_name: str = Field(
        description="Name of the GPU (e.g. 'RTX 4090', 'RTX 3060 12GB', 'Apple M2 16GB')."
    )
    quantization: str = Field(
        default="q4_k_m",
        description="Quantization type (e.g. 'q4_k_m', 'fp16', 'q8_0').",
    )
    context_length: int = Field(
        default=8192,
        ge=512,
        le=131072,
        description="Target context window in tokens.",
    )


class ListHardwareArgs(BaseModel):
    pass


class RecommendModelsArgs(BaseModel):
    task: str | None = Field(
        default=None,
        description="Task category: 'coding', 'general', 'reasoning', 'writing'.",
    )
    hardware_name: str | None = Field(default=None, description="Target GPU or hardware name.")
    memory_budget_gb: float | None = Field(
        default=None,
        description="Memory budget in Gigabytes if GPU name is unknown.",
    )
    max_context: int = Field(default=8192, description="Context length.")
    quantization: str = Field(default="q4_k_m", description="Quantization preference.")
    license_preference: str = Field(
        default="any",
        description="License preference: 'any', 'permissive', 'open_weights'.",
    )


TOOL_DECLARATIONS = [
    {
        "name": "search_models",
        "description": "Searches for AI models in the Hugging Face Hub by keyword.",
        "parameters": SearchModelsArgs.model_json_schema(),
    },
    {
        "name": "get_model_details",
        "description": (
            "Retrieves normalized metadata, parameters, and architecture support status "
            "for a specific model repo ID."
        ),
        "parameters": GetModelDetailsArgs.model_json_schema(),
    },
    {
        "name": "estimate_memory",
        "description": (
            "Calculates exact deterministic memory breakdown (weights, KV cache, activations, "
            "headroom) and fit verdict for a model on specific hardware."
        ),
        "parameters": EstimateMemoryArgs.model_json_schema(),
    },
    {
        "name": "list_hardware",
        "description": (
            "Lists verified preset GPUs and hardware profiles with their exact VRAM capacities."
        ),
        "parameters": ListHardwareArgs.model_json_schema(),
    },
    {
        "name": "recommend_models",
        "description": (
            "Runs the deterministic recommendation engine to rank the best fitting models "
            "for a task and hardware specification."
        ),
        "parameters": RecommendModelsArgs.model_json_schema(),
    },
]


async def execute_tool(
    name: str,
    args: dict[str, Any],
    session: AsyncSession,
) -> dict[str, Any]:
    """Dispatches tool execution to the underlying typed domain service."""
    try:
        catalog_service = CatalogService()
        hardware_service = HardwareService()
        recommend_service = RecommendService(catalog_service)

        if name == "search_models":
            validated_search = SearchModelsArgs.model_validate(args)
            res = await catalog_service.list_models(
                session=session,
                search=validated_search.query,
                limit=validated_search.limit,
            )
            return {
                "items": [
                    {
                        "id": m.id,
                        "author": m.author,
                        "model_name": m.model_name,
                        "pipeline_tag": m.pipeline_tag,
                        "downloads": m.downloads,
                        "likes": m.likes,
                        "is_supported": m.is_supported,
                        "license": m.license,
                    }
                    for m in res.items
                ]
            }

        elif name == "get_model_details":
            validated_detail = GetModelDetailsArgs.model_validate(args)
            detail = await catalog_service.get_model_detail(session, validated_detail.repo_id)
            total_p = (
                detail.normalized_model.total_params
                if detail.normalized_model
                else None
            )
            return {
                "id": detail.id,
                "model_name": detail.model_name,
                "author": detail.author,
                "pipeline_tag": detail.pipeline_tag,
                "is_supported": detail.is_supported,
                "support_status": detail.support_status.value,
                "support_reason_code": detail.support_reason_code,
                "support_reason_message": detail.support_reason_message,
                "total_params": total_p,
                "license": detail.license,
            }

        elif name == "list_hardware":
            hw_list = await hardware_service.list_profiles(session)
            return {
                "profiles": [
                    {
                        "name": h.name,
                        "kind": h.kind,
                        "memory_gb": round(h.memory_bytes / (1024**3), 2),
                        "memory_bytes": h.memory_bytes,
                    }
                    for h in hw_list
                ]
            }

        elif name == "estimate_memory":
            validated_est = EstimateMemoryArgs.model_validate(args)
            est_hw_list: list[Any] = await hardware_service.list_profiles(session)
            if not est_hw_list:
                est_hw_list = _load_hardware_presets()

            hw_input, assumptions = _match_hardware_profile(
                validated_est.hardware_name, list(est_hw_list)
            )
            if not hw_input:
                return {
                    "status": "error",
                    "error_type": "clarification_required",
                    "retryable": False,
                    "action_required": "ask_user_clarification",
                    "missing_fields": ["hardware"],
                    "message": (
                        f"Could not unambiguously match hardware '{validated_est.hardware_name}' "
                        "to a known profile. Please specify an exact GPU model "
                        "(e.g. 'RTX 4090') or explicit VRAM/Unified Memory in GB."
                    ),
                }

            quant_fmt = QuantizationFormat.Q4_K_M
            with contextlib.suppress(ValueError):
                quant_fmt = QuantizationFormat(validated_est.quantization)

            cfg = EstimationConfig(
                quantization=quant_fmt,
                context_length=validated_est.context_length,
                batch_size=1,
            )
            req = EstimateRequest(
                repo_id=validated_est.repo_id,
                hardware=hw_input,
                config=cfg,
            )
            est_res = await hardware_service.estimate_for_request(session, req, catalog_service)
            res_dict = dict(est_res.model_dump())
            if assumptions:
                res_dict["assumptions"] = assumptions
            return res_dict

        elif name == "recommend_models":
            validated_rec = RecommendModelsArgs.model_validate(args)
            hw_input = None
            rec_assumptions: list[str] = []
            if validated_rec.memory_budget_gb and validated_rec.memory_budget_gb > 0:
                budget = int(validated_rec.memory_budget_gb * (1024**3))
                hw_name = (
                    validated_rec.hardware_name
                    or f"Custom {validated_rec.memory_budget_gb}GB VRAM"
                )
                hw_input = HardwareProfileInput(
                    name=hw_name,
                    memory_bytes=budget,
                    kind=HardwareKind.GPU,
                    reserved_memory_bytes=int(budget * 0.05),
                )
                rec_assumptions.append(
                    f"GPU VRAM budget ({validated_rec.memory_budget_gb}GB) is user-provided."
                )
            elif validated_rec.hardware_name:
                rec_hw_list: list[Any] = await hardware_service.list_profiles(session)
                if not rec_hw_list:
                    rec_hw_list = _load_hardware_presets()

                hw_input, rec_assumptions = _match_hardware_profile(
                    validated_rec.hardware_name, list(rec_hw_list)
                )
                if not hw_input:
                    return {
                        "status": "error",
                        "error_type": "clarification_required",
                        "needs_clarification": True,
                        "retryable": False,
                        "action_required": "ask_user_clarification",
                        "missing_fields": ["hardware"],
                        "message": (
                            f"Could not unambiguously match hardware "
                            f"'{validated_rec.hardware_name}' to a known profile. "
                            "Please specify your exact GPU model or an explicit VRAM budget in GB."
                        ),
                    }
            else:
                return {
                    "status": "error",
                    "error_type": "clarification_required",
                    "needs_clarification": True,
                    "retryable": False,
                    "action_required": "ask_user_clarification",
                    "missing_fields": ["hardware"],
                    "message": (
                        "Please specify your GPU hardware profile "
                        "or an explicit VRAM budget in GB."
                    ),
                }

            quant_val = QuantizationFormat.Q4_K_M
            with contextlib.suppress(ValueError):
                quant_val = QuantizationFormat(validated_rec.quantization)

            task_val = (
                validated_rec.task
                if validated_rec.task in ("general", "coding", "reasoning", "writing")
                else None
            )
            budget_bytes = (
                int(validated_rec.memory_budget_gb * (1024**3))
                if validated_rec.memory_budget_gb
                else None
            )
            lic_pref = (
                validated_rec.license_preference
                if validated_rec.license_preference in ("permissive", "open_weights", "any")
                else "any"
            )

            spec = RequirementSpec(
                task=task_val,  # type: ignore[arg-type]
                hardware=hw_input,
                memory_budget_bytes=budget_bytes,
                max_context=validated_rec.max_context,
                quantization_preference=quant_val,
                license_preference=lic_pref,  # type: ignore[arg-type]
            )
            rec_result = await recommend_service.recommend(spec, session)
            res_dict = rec_result.model_dump()
            if rec_assumptions:
                res_dict["assumptions"] = rec_assumptions
            return res_dict

        else:
            return {"error": f"Unknown tool: {name}", "retryable": False}

    except AppError as exc:
        logger.warning("tool_app_error", tool=name, code=exc.code, error=exc.message)
        return {
            "status": "error",
            "error_type": "terminal_tool_error",
            "retryable": False,
            "code": exc.code,
            "error": exc.message,
            "message": (
                f"Tool execution stopped ({exc.code}): {exc.message}. "
                "Do not retry this tool call."
            ),
        }
    except Exception as exc:
        logger.warning("tool_execution_error", tool=name, error=str(exc))
        return {
            "status": "error",
            "error_type": "unexpected_error",
            "retryable": False,
            "error": str(exc),
            "message": f"Tool execution failed: {str(exc)}. Do not retry this tool call.",
        }
