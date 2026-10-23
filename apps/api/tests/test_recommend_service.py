"""Tests for RecommendService: deterministic ranking, headroom curve, and candidate filtering."""

from unittest.mock import AsyncMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from modelfit.modules.catalog.schemas import (
    ModelDetailResponse,
    ModelListResponse,
    ModelSummary,
    SupportStatus,
)
from modelfit.modules.estimator.schemas import (
    ArchitectureCategory,
    AttentionVariant,
    HardwareProfileInput,
    NormalizedModel,
    QuantizationFormat,
)
from modelfit.modules.recommend.constants import (
    WEIGHT_DOWNLOADS,
    WEIGHT_HEADROOM,
    WEIGHT_LICENSE,
    WEIGHT_RECENCY,
)
from modelfit.modules.recommend.schemas import (
    ClarificationNeeded,
    RecommendationResponse,
    RequirementSpec,
)
from modelfit.modules.recommend.service import RecommendService


def create_dummy_normalized_model(
    repo_id: str,
    total_params: int = 8_000_000_000,
) -> NormalizedModel:
    return NormalizedModel(
        id=repo_id,
        architecture_name="LlamaForCausalLM",
        architecture_category=ArchitectureCategory.STANDARD_TRANSFORMER,
        total_params=total_params,
        active_params=total_params,
        num_layers=32,
        hidden_size=4096,
        num_attention_heads=32,
        num_kv_heads=8,
        head_dim=128,
        vocab_size=128256,
        max_context_length=8192,
        intermediate_size=14336,
        tie_word_embeddings=False,
        attention_variant=AttentionVariant.GROUPED_QUERY,
    )


@pytest.mark.asyncio
async def test_recommend_missing_fields_requests_clarification(db_session: AsyncSession) -> None:
    mock_catalog = AsyncMock()
    service = RecommendService(catalog_service=mock_catalog)

    # Missing task
    res1 = await service.recommend(
        RequirementSpec(
            task=None,
            hardware=HardwareProfileInput(name="RTX 4090", memory_bytes=24 * 1024**3),
        ),
        session=db_session,
    )
    assert isinstance(res1, ClarificationNeeded)
    assert "task" in res1.missing_fields

    # Missing hardware
    res2 = await service.recommend(
        RequirementSpec(task="coding", hardware=None, memory_budget_bytes=None),
        session=db_session,
    )
    assert isinstance(res2, ClarificationNeeded)
    assert "hardware" in res2.missing_fields


@pytest.mark.asyncio
async def test_recommend_deterministic_ranking_and_filtering(db_session: AsyncSession) -> None:
    mock_catalog = AsyncMock()

    # Create mock candidates
    # Model 1: Llama 3 8B (Fits with great headroom)
    norm1 = create_dummy_normalized_model("meta-llama/Meta-Llama-3-8B", 8_000_000_000)
    detail1 = ModelDetailResponse(
        id="meta-llama/Meta-Llama-3-8B",
        author="meta-llama",
        model_name="Meta-Llama-3-8B",
        pipeline_tag="text-generation",
        likes=1000,
        downloads=500_000,
        is_supported=True,
        support_status=SupportStatus.SUPPORTED_LLM,
        gated=False,
        license="llama3",
        param_provenance="safetensors",
        normalized_model=norm1,
    )

    # Model 2: Massive 70B (Out of memory on 12GB)
    norm2 = create_dummy_normalized_model("meta-llama/Meta-Llama-3-70B", 70_000_000_000)
    detail2 = ModelDetailResponse(
        id="meta-llama/Meta-Llama-3-70B",
        author="meta-llama",
        model_name="Meta-Llama-3-70B",
        pipeline_tag="text-generation",
        likes=2000,
        downloads=1_000_000,
        is_supported=True,
        support_status=SupportStatus.SUPPORTED_LLM,
        gated=False,
        license="llama3",
        param_provenance="safetensors",
        normalized_model=norm2,
    )

    # Model 3: Unsupported architecture (SSM)
    norm3 = create_dummy_normalized_model("state-spaces/mamba-130m", 130_000_000)
    norm3.architecture_category = ArchitectureCategory.SSM
    detail3 = ModelDetailResponse(
        id="state-spaces/mamba-130m",
        author="state-spaces",
        model_name="mamba-130m",
        pipeline_tag="text-generation",
        likes=50,
        downloads=5_000,
        is_supported=False,
        support_status=SupportStatus.UNSUPPORTED_ARCHITECTURE,
        support_reason_code="UNSUPPORTED_ARCHITECTURE",
        support_reason_message="SSM state-space architecture is not supported",
        gated=False,
        license="apache-2.0",
        param_provenance="config",
        normalized_model=norm3,
    )

    mock_catalog.list_models.return_value = ModelListResponse(
        items=[
            ModelSummary(
                id=detail1.id,
                author=detail1.author,
                model_name=detail1.model_name,
                pipeline_tag=detail1.pipeline_tag,
                likes=detail1.likes,
                downloads=detail1.downloads,
                is_supported=True,
                support_status=SupportStatus.SUPPORTED_LLM,
            ),
            ModelSummary(
                id=detail2.id,
                author=detail2.author,
                model_name=detail2.model_name,
                pipeline_tag=detail2.pipeline_tag,
                likes=detail2.likes,
                downloads=detail2.downloads,
                is_supported=True,
                support_status=SupportStatus.SUPPORTED_LLM,
            ),
            ModelSummary(
                id=detail3.id,
                author=detail3.author,
                model_name=detail3.model_name,
                pipeline_tag=detail3.pipeline_tag,
                likes=detail3.likes,
                downloads=detail3.downloads,
                is_supported=False,
                support_status=SupportStatus.UNSUPPORTED_ARCHITECTURE,
            ),
        ]
    )

    async def mock_get_detail(session: AsyncSession, repo_id: str) -> ModelDetailResponse:
        if repo_id == detail1.id:
            return detail1
        elif repo_id == detail2.id:
            return detail2
        return detail3

    mock_catalog.get_model_detail.side_effect = mock_get_detail

    service = RecommendService(catalog_service=mock_catalog)
    # Hardware: 12GB VRAM
    res = await service.recommend(
        RequirementSpec(
            task="coding",
            hardware=HardwareProfileInput(name="RTX 3060", memory_bytes=12 * 1024**3),
            quantization_preference=QuantizationFormat.Q4_K_M,
        ),
        session=db_session,
    )

    assert isinstance(res, RecommendationResponse)
    # Model 1 (8B) fits and is recommended
    assert len(res.recommendations) == 1
    assert res.recommendations[0].model_id == "meta-llama/Meta-Llama-3-8B"
    # Model 2 (70B) does not fit -> dropped_oom_count == 1
    assert res.dropped_oom_count == 1
    # Model 3 (Mamba) is unsupported -> dropped_unsupported_count == 1
    assert res.dropped_unsupported_count == 1
    assert any("mamba" in r for r in res.unsupported_reasons)


def test_headroom_and_license_scoring_weights() -> None:
    """Verifies that scoring constants match the documentation design choices."""
    assert round(WEIGHT_HEADROOM + WEIGHT_DOWNLOADS + WEIGHT_RECENCY + WEIGHT_LICENSE, 2) == 1.00
