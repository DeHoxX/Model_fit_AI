import contextlib
from typing import Any

import structlog
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

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
    catalog_service = CatalogService()
    hardware_service = HardwareService(HardwareRepository())
    recommend_service = RecommendService(catalog_service)

    try:
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
            # Find hardware profile or synthesize
            hw_list = await hardware_service.list_profiles(session)
            matched_hw = next(
                (h for h in hw_list if validated_est.hardware_name.lower() in h.name.lower()),
                None,
            )
            if matched_hw:
                kind_val = HardwareKind.GPU
                with contextlib.suppress(ValueError):
                    kind_val = HardwareKind(matched_hw.kind)
                hw_input = HardwareProfileInput(
                    name=matched_hw.name,
                    memory_bytes=matched_hw.memory_bytes,
                    kind=kind_val,
                    reserved_memory_bytes=matched_hw.reserved_memory_bytes,
                )
            else:
                # Default 12GB fallback if unknown
                hw_input = HardwareProfileInput(
                    name=validated_est.hardware_name,
                    memory_bytes=12 * 1024**3,
                    kind=HardwareKind.GPU,
                    reserved_memory_bytes=1024**3,
                )

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
            return dict(est_res.model_dump())

        elif name == "recommend_models":
            validated_rec = RecommendModelsArgs.model_validate(args)
            hw_input = None
            if validated_rec.hardware_name:
                hw_list = await hardware_service.list_profiles(session)
                matched = next(
                    (h for h in hw_list if validated_rec.hardware_name.lower() in h.name.lower()),
                    None,
                )
                if matched:
                    kind_val = HardwareKind.GPU
                    with contextlib.suppress(ValueError):
                        kind_val = HardwareKind(matched.kind)
                    hw_input = HardwareProfileInput(
                        name=matched.name,
                        memory_bytes=matched.memory_bytes,
                        kind=kind_val,
                        reserved_memory_bytes=matched.reserved_memory_bytes,
                    )
                else:
                    budget = int((validated_rec.memory_budget_gb or 12.0) * (1024**3))
                    hw_input = HardwareProfileInput(
                        name=validated_rec.hardware_name,
                        memory_bytes=budget,
                        kind=HardwareKind.GPU,
                        reserved_memory_bytes=int(budget * 0.05),
                    )

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
            return rec_result.model_dump()

        else:
            return {"error": f"Unknown tool: {name}"}

    except Exception as exc:
        logger.warning("tool_execution_error", tool=name, error=str(exc))
        return {"error": f"Tool execution failed: {str(exc)}"}
