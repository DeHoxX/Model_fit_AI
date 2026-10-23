from enum import Enum

from pydantic import BaseModel, ConfigDict, Field

from modelfit.modules.estimator.schemas import NormalizedModel


class SupportStatus(str, Enum):
    SUPPORTED_LLM = "supported_llm"
    UNSUPPORTED_ARCHITECTURE = "unsupported_architecture"
    UNSUPPORTED_MODALITY = "unsupported_modality"
    INCOMPLETE_METADATA = "incomplete_metadata"
    NOT_CHECKED = "not_checked"


class ModelSummary(BaseModel):
    """Compact summary of a model for search and discovery lists."""

    model_config = ConfigDict(extra="forbid")

    id: str
    author: str
    model_name: str
    pipeline_tag: str | None = None
    likes: int = 0
    downloads: int = 0
    is_supported: bool = True
    architecture_name: str | None = None
    total_params: int | None = None
    gated: bool = False
    license: str | None = None
    support_status: SupportStatus = SupportStatus.NOT_CHECKED
    support_reason_code: str | None = None
    support_reason_message: str | None = None


class ModelListResponse(BaseModel):
    """Paginated list of models with opaque cursor."""

    model_config = ConfigDict(extra="forbid")

    items: list[ModelSummary]
    next_cursor: str | None = None
    has_more: bool = False


class ModelDetailResponse(BaseModel):
    """Full normalized model metadata with provenance, gated status, and license."""

    model_config = ConfigDict(extra="forbid")

    id: str
    author: str
    model_name: str
    pipeline_tag: str | None = None
    likes: int = 0
    downloads: int = 0
    is_supported: bool = True
    support_status: SupportStatus = SupportStatus.SUPPORTED_LLM
    support_reason_code: str | None = None
    support_reason_message: str | None = None
    gated: bool = False
    license: str | None = None
    param_provenance: str = Field(
        description="Source of parameter counts: 'safetensors', 'config', or 'derived'"
    )

    normalized_model: NormalizedModel
    warning: str | None = None

