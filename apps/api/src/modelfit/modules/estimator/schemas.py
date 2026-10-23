"""Pure Pydantic schemas for the memory estimation engine."""

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, model_validator


class AttentionVariant(str, Enum):
    FULL_MHA = "full_mha"
    GROUPED_QUERY = "grouped_query"
    MULTI_QUERY = "multi_query"
    SLIDING_WINDOW = "sliding_window"


class ArchitectureCategory(str, Enum):
    STANDARD_TRANSFORMER = "standard_transformer"
    MOE = "moe"
    MLA = "mla"
    SSM = "ssm"
    HYBRID = "hybrid"
    MULTIMODAL = "multimodal"


class MetadataCompleteness(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_complete: bool
    missing_fields: list[str] = Field(default_factory=list)


class NormalizedModel(BaseModel):
    """Normalized model architecture metadata.

    Contains strictly architecture and weight parameters.
    Every numeric field is Optional to represent models with incomplete metadata.
    """

    model_config = ConfigDict(extra="forbid")

    id: str
    architecture_name: str
    architecture_category: ArchitectureCategory = ArchitectureCategory.STANDARD_TRANSFORMER
    total_params: int | None = None
    active_params: int | None = None
    num_layers: int | None = None
    hidden_size: int | None = None
    num_attention_heads: int | None = None
    num_kv_heads: int | None = None
    head_dim: int | None = None
    vocab_size: int | None = None
    max_context_length: int | None = None
    intermediate_size: int | None = None
    tie_word_embeddings: bool = False
    num_experts: int | None = None
    experts_per_token: int | None = None
    attention_variant: AttentionVariant = AttentionVariant.FULL_MHA
    sliding_window_size: int | None = None

    def check_completeness(self) -> MetadataCompleteness:
        """Audits essential fields required for memory calculation."""
        missing: list[str] = []
        if self.total_params is None:
            missing.append("total_params")
        if self.num_layers is None:
            missing.append("num_layers")
        if self.hidden_size is None:
            missing.append("hidden_size")
        if self.num_attention_heads is None:
            missing.append("num_attention_heads")
        return MetadataCompleteness(
            is_complete=len(missing) == 0,
            missing_fields=missing,
        )


class QuantizationFormat(str, Enum):
    FP32 = "fp32"
    FP16 = "fp16"
    BF16 = "bf16"
    INT8 = "int8"
    Q8_0 = "q8_0"
    Q5_K_M = "q5_k_m"
    Q4_K_M = "q4_k_m"
    Q4_K_S = "q4_k_s"
    Q4_0 = "q4_0"
    Q4_1 = "q4_1"
    AWQ_4BIT = "awq_4bit"
    GPTQ_4BIT = "gptq_4bit"


class KVCacheDtype(str, Enum):
    FP16 = "fp16"
    BF16 = "bf16"
    FP8 = "fp8"
    INT8 = "int8"


class InferenceRuntime(str, Enum):
    LLAMA_CPP = "llama_cpp"
    VLLM = "vllm"
    TRANSFORMERS = "transformers"


class EstimationConfig(BaseModel):
    """Configuration for inference memory estimation."""

    model_config = ConfigDict(extra="forbid")

    quantization: QuantizationFormat
    kv_cache_dtype: KVCacheDtype = KVCacheDtype.FP16
    context_length: int = Field(gt=0, description="Requested inference sequence length in tokens")
    batch_size: int = Field(default=1, gt=0, description="Inference batch size")
    runtime: InferenceRuntime = InferenceRuntime.LLAMA_CPP
    gpu_count: int = Field(default=1, ge=1, description="Total available GPUs")
    tensor_parallel_degree: int = Field(default=1, ge=1, description="Degree of tensor parallelism")

    @model_validator(mode="after")
    def validate_tensor_parallel(self) -> "EstimationConfig":
        if self.tensor_parallel_degree > self.gpu_count:
            raise ValueError(
                f"tensor_parallel_degree ({self.tensor_parallel_degree}) "
                f"cannot exceed gpu_count ({self.gpu_count})"
            )
        return self


class HardwareKind(str, Enum):
    GPU = "gpu"
    APPLE_UNIFIED = "apple_unified"
    CPU_RAM = "cpu_ram"


class HardwareProfileInput(BaseModel):
    """Hardware profile specification in bytes."""

    model_config = ConfigDict(extra="forbid")

    name: str
    memory_bytes: int = Field(gt=0, description="Total physical memory in bytes")
    kind: HardwareKind = HardwareKind.GPU
    reserved_memory_bytes: int = Field(
        default=0, ge=0, description="Memory reserved for OS or display in bytes"
    )


class Verdict(str, Enum):
    FITS = "fits"
    FITS_TIGHT = "fits_tight"
    DOES_NOT_FIT = "does_not_fit"
    CANNOT_ESTIMATE = "cannot_estimate"


class ConfidenceLevel(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class EstimationResult(BaseModel):
    """Calculated memory breakdown and fit verdict."""

    model_config = ConfigDict(extra="forbid")

    weights_bytes: int
    kv_cache_bytes: int
    activation_bytes: int
    runtime_overhead_bytes: int
    total_bytes: int
    per_device_bytes: int | None = None
    verdict: Verdict
    headroom_bytes: int
    assumptions: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    unsupported_reasons: list[str] = Field(default_factory=list)
    confidence: ConfidenceLevel
