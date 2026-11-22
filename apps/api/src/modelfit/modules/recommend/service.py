"""Deterministic recommendation pipeline and candidate scoring service."""

import asyncio
import math
from datetime import UTC, datetime
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from modelfit.core.errors import AppError
from modelfit.modules.catalog.schemas import SupportStatus
from modelfit.modules.catalog.service import CatalogService
from modelfit.modules.estimator.calculator import estimate_memory
from modelfit.modules.estimator.schemas import (
    EstimationConfig,
    HardwareKind,
    HardwareProfileInput,
)
from modelfit.modules.recommend.constants import (
    HUB_CONCURRENCY_LIMIT,
    LICENSE_SCORES_ANY,
    LICENSE_SCORES_OPEN_WEIGHTS,
    LICENSE_SCORES_PERMISSIVE,
    MAX_CANDIDATES,
    MIN_SAFE_HEADROOM,
    OPEN_WEIGHT_LICENSES,
    OPTIMAL_HEADROOM_MAX,
    OPTIMAL_HEADROOM_MIN,
    PERMISSIVE_LICENSES,
    TASK_SEARCH_TERMS,
    WEIGHT_DOWNLOADS,
    WEIGHT_HEADROOM,
    WEIGHT_LICENSE,
    WEIGHT_RECENCY,
)
from modelfit.modules.recommend.schemas import (
    ClarificationNeeded,
    RecommendationCandidate,
    RecommendationResponse,
    RequirementSpec,
    ScoringBreakdown,
)

logger = structlog.get_logger(__name__)


class RecommendService:
    """Service that executes the deterministic model recommendation pipeline."""

    def __init__(self, catalog_service: CatalogService) -> None:
        self.catalog_service = catalog_service

    async def recommend(
        self,
        spec: RequirementSpec,
        session: AsyncSession,
    ) -> RecommendationResponse | ClarificationNeeded:
        """Executes the multi-stage recommendation pipeline."""
        # 1. Check for missing essential requirements
        missing: list[str] = []
        if not spec.task:
            missing.append("task")
        if not spec.hardware and not spec.memory_budget_bytes:
            missing.append("hardware")

        if missing:
            message_parts: list[str] = []
            if "hardware" in missing:
                message_parts.append("your hardware specifications (e.g. GPU model and VRAM)")
            if "task" in missing:
                message_parts.append(
                    "your intended use case (coding, general chat, reasoning, writing)"
                )
            msg = (
                f"To provide accurate recommendations, please specify "
                f"{' and '.join(message_parts)}."
            )
            return ClarificationNeeded(missing_fields=missing, message=msg)

        # 2. Build hardware profile
        if spec.hardware:
            hw_input = HardwareProfileInput(
                name=spec.hardware.name,
                memory_bytes=spec.hardware.memory_bytes,
                kind=spec.hardware.kind,
                reserved_memory_bytes=spec.hardware.reserved_memory_bytes,
                is_preset=spec.hardware.is_preset,
            )
        else:
            budget = spec.memory_budget_bytes or 8 * (1024**3)
            hw_input = HardwareProfileInput(
                name="Custom Memory Budget",
                memory_bytes=budget,
                kind=HardwareKind.GPU,
                reserved_memory_bytes=int(budget * 0.05),
                is_preset=False,
            )

        # 3. Retrieve candidates by querying catalogue using task search terms
        task_str = spec.task or "general"
        search_terms = TASK_SEARCH_TERMS.get(task_str, ["instruct"])

        candidate_summaries: list[Any] = []
        seen_ids: set[str] = set()

        for term in search_terms:
            try:
                res = await self.catalog_service.list_models(
                    session=session,
                    search=term,
                    sort="downloads",
                    limit=MAX_CANDIDATES,
                )
                for item in res.items:
                    if item.id not in seen_ids:
                        seen_ids.add(item.id)
                        candidate_summaries.append(item)
                    if len(candidate_summaries) >= MAX_CANDIDATES:
                        break
            except AppError as exc:
                logger.warning("recommend_catalog_search_error", term=term, error=exc.message)
            if len(candidate_summaries) >= MAX_CANDIDATES:
                break

        # 4. Fetch details and calculate memory under bounded concurrency
        semaphore = asyncio.Semaphore(HUB_CONCURRENCY_LIMIT)
        dropped_oom = 0
        dropped_unsupported = 0
        unsupported_reasons: list[str] = []
        warning_note: str | None = None
        ranked_candidates: list[RecommendationCandidate] = []

        async def evaluate_candidate(summary: Any) -> None:
            nonlocal dropped_oom, dropped_unsupported, warning_note
            async with semaphore:
                try:
                    detail = await self.catalog_service.get_model_detail(session, summary.id)
                except AppError as exc:
                    if exc.code == "HF_RATE_LIMITED":
                        warning_note = (
                            "Upstream Hugging Face rate limit reached. "
                            "Displaying partial recommendations."
                        )
                    dropped_unsupported += 1
                    unsupported_reasons.append(f"{summary.id}: {exc.message}")
                    return

                if not detail.is_supported or detail.support_status != SupportStatus.SUPPORTED_LLM:
                    dropped_unsupported += 1
                    reason = detail.support_reason_message or "Unsupported architecture"
                    unsupported_reasons.append(f"{detail.id}: {reason}")
                    return

                # Calculate memory
                cfg = EstimationConfig(
                    quantization=spec.quantization_preference,
                    context_length=spec.max_context,
                    batch_size=1,
                )
                est = estimate_memory(detail.normalized_model, cfg, hw_input)

                if est.verdict == "does_not_fit":
                    dropped_oom += 1
                    return
                elif est.verdict == "cannot_estimate":
                    dropped_unsupported += 1
                    unsupported_reasons.append(f"{detail.id}: Cannot estimate memory requirements")
                    return

                # Candidate fits or fits_tight
                warnings_list: list[str] = list(est.warnings)
                if est.verdict == "fits_tight":
                    warnings_list.append(
                        "Fits tightly with limited KV-cache headroom. "
                        "May experience OOM if context expands."
                    )

                scoring = self._calculate_score(
                    detail=detail,
                    estimate=est,
                    hardware=hw_input,
                    spec=spec,
                )

                gib_headroom = est.headroom_bytes / (1024**3)
                rank_reasons = [
                    f"Headroom: {gib_headroom:.1f} GiB ({scoring.headroom_score * 100:.0f}% score)",
                    f"Popularity: {detail.downloads:,} downloads",
                    f"License: {detail.license or 'unknown'}",
                    "Recency: not yet implemented (neutral 0.5)",
                ]

                ranked_candidates.append(
                    RecommendationCandidate(
                        model_id=detail.id,
                        model_name=detail.model_name,
                        author=detail.author,
                        pipeline_tag=detail.pipeline_tag or "text-generation",
                        license=detail.license,
                        estimate=est,
                        verdict=est.verdict,
                        warnings=warnings_list,
                        assumptions=list(est.assumptions),
                        scoring=scoring,
                        rank_reasons=rank_reasons,
                        quantization=cfg.quantization.value,
                        kv_cache_dtype=cfg.kv_cache_dtype.value,
                        runtime=cfg.runtime.value,
                        context_length=cfg.context_length,
                        resolved_hardware=est.resolved_hardware,
                    )
                )

        for c in candidate_summaries:
            await evaluate_candidate(c)

        # 5. Deterministic ranking: total_score descending, downloads descending, model_id ascending
        ranked_candidates.sort(
            key=lambda c: (-c.scoring.total_score, -c.estimate.weights_bytes, c.model_id)
        )

        return RecommendationResponse(
            recommendations=ranked_candidates,
            dropped_oom_count=dropped_oom,
            dropped_unsupported_count=dropped_unsupported,
            unsupported_reasons=unsupported_reasons,
            warning=warning_note,
        )

    def _calculate_score(
        self,
        detail: Any,
        estimate: Any,
        hardware: HardwareProfileInput,
        spec: RequirementSpec,
    ) -> ScoringBreakdown:
        """Computes deterministic scores across 4 dimensions."""
        total_hw = max(1, hardware.memory_bytes)
        headroom_ratio = estimate.headroom_bytes / total_hw

        # 1. Headroom Score
        if headroom_ratio < MIN_SAFE_HEADROOM:
            # Dangerous tight fit (<5%)
            headroom_score = max(0.0, (headroom_ratio / MIN_SAFE_HEADROOM) * 0.3)
        elif headroom_ratio < OPTIMAL_HEADROOM_MIN:
            # 5% to 15%
            delta = headroom_ratio - MIN_SAFE_HEADROOM
            span = OPTIMAL_HEADROOM_MIN - MIN_SAFE_HEADROOM
            fraction = delta / span
            headroom_score = 0.3 + fraction * 0.7
        elif headroom_ratio <= OPTIMAL_HEADROOM_MAX:
            # 15% to 30% is sweet spot
            headroom_score = 1.0
        else:
            # Overkill (>30% unused headroom)
            headroom_score = max(0.4, 1.0 - (headroom_ratio - OPTIMAL_HEADROOM_MAX) * 0.5)
        headroom_score = min(1.0, max(0.0, headroom_score))

        # 2. Downloads Score
        downloads = getattr(detail, "downloads", 0) or 0
        downloads_score = min(1.0, max(0.0, math.log10(max(1, downloads)) / 7.0))

        # 3. Recency Score (from model_cache / last_modified)
        recency_score = 0.5
        # If detail has last_modified
        last_mod = getattr(detail, "last_modified", None)
        if isinstance(last_mod, datetime):
            days_old = max(0, (datetime.now(UTC) - last_mod).days)
            recency_score = min(1.0, max(0.0, math.exp(-days_old / 365.0)))

        # 4. License Score
        lic = (detail.license or "").lower().strip()
        pref = spec.license_preference

        if pref == "permissive":
            table = LICENSE_SCORES_PERMISSIVE
        elif pref == "open_weights":
            table = LICENSE_SCORES_OPEN_WEIGHTS
        else:
            table = LICENSE_SCORES_ANY

        if not lic:
            license_score = table["unknown"]
        elif lic in PERMISSIVE_LICENSES:
            license_score = table["permissive"]
        elif lic in OPEN_WEIGHT_LICENSES:
            license_score = table["open_weights"]
        else:
            license_score = table["other"]

        total_score = (
            WEIGHT_HEADROOM * headroom_score
            + WEIGHT_DOWNLOADS * downloads_score
            + WEIGHT_RECENCY * recency_score
            + WEIGHT_LICENSE * license_score
        )
        total_score = min(1.0, max(0.0, total_score))

        return ScoringBreakdown(
            headroom_score=round(headroom_score, 4),
            downloads_score=round(downloads_score, 4),
            recency_score=round(recency_score, 4),
            license_score=round(license_score, 4),
            total_score=round(total_score, 4),
        )
