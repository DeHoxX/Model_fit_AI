# ModelFit Estimator Specification

## 1. Overview
The ModelFit Estimation Engine is a pure, deterministic mathematical framework for calculating memory requirements of LLM inference workloads. It serves as the single source of truth for memory numbers, fit verdicts, and compatibility assessments.

It does not invoke runtime APIs, execute models, or measure token generation speeds. All outputs are derived strictly from model architectural parameters, execution configuration, and hardware constraints.

---

## 2. Mathematical Formulas

### 2.1 Model Weights Memory
$$\text{Weights Bytes} = \text{total\_params} \times \frac{\text{bits\_per\_weight}}{8}$$

- **Mixture of Experts (MoE) Rule**: For MoE architectures (e.g. Mixtral 8x7B), memory estimation uses $\text{total\_params}$, **never** $\text{active\_params}$. In standard inference runtimes, all expert parameters must be loaded into memory (VRAM or system RAM) regardless of routing.
- **Tied Word Embeddings**: If embeddings are tied (`tie_word_embeddings = true`), parameters are not double-counted.

#### Bits-per-weight lookup table:
| Quantization Type | Bits per Weight (bpw) | Bytes per Parameter | Source & Verification |
| :--- | :--- | :--- | :--- |
| `fp32` | 32.0 | 4.000 | IEEE 754 single precision float standard |
| `fp16` | 16.0 | 2.000 | IEEE 754-2008 half precision float standard |
| `bf16` | 16.0 | 2.000 | Bfloat16 format standard |
| `int8` | 8.0 | 1.000 | 8-bit integer linear quantization |
| `q8_0` | 8.5 | 1.0625 | llama.cpp k-quants: 32-block with 16-bit float scale (8 + 16/32 = 8.5 bpw) |
| `q5_k_m` | 5.5 | 0.6875 | llama.cpp k-quants documentation [TODO(verify)] |
| `q4_k_m` | 4.85 | 0.60625 | llama.cpp k-quants documentation (mixed 4/6-bit block representation) |
| `q4_k_s` | 4.5 | 0.5625 | llama.cpp k-quants documentation (pure 4-bit block representation) |
| `q4_0` | 4.5 | 0.5625 | llama.cpp: 32-block with 16-bit half scale (4 + 16/32 = 4.5 bpw) |
| `q4_1` | 5.0 | 0.625 | llama.cpp: 32-block with 16-bit scale + 16-bit min (4 + 32/32 = 5.0 bpw) |
| `awq_4bit` | 4.5 | 0.5625 | 4-bit quantization + FP16 group scales/zeros for group size 128 [TODO(verify)] |
| `gptq_4bit`| 4.5 | 0.5625 | 4-bit quantization + group scale overhead [TODO(verify)] |

---

### 2.2 Key-Value (KV) Cache Memory
$$\text{KV Bytes} = 2 \times \text{layers} \times \text{kv\_heads} \times \text{head\_dim} \times \text{cached\_tokens} \times \text{batch\_size} \times \text{bytes\_per\_element}$$

Where:
- The factor of $2$ accounts for the Key and Value matrices stored per attention head per layer.
- `bytes_per_element`:
  - `fp16` / `bf16`: 2 bytes
  - `fp8` / `int8`: 1 byte
- **Sliding-Window Attention (SWA)**:
  When `attention_variant == sliding_window` and `sliding_window_size` is confirmed by metadata:
  $$\text{cached\_tokens} = \min(\text{context\_length}, \text{sliding\_window\_size})$$
  When sliding window is absent or unproven, $\text{cached\_tokens} = \text{context\_length}$.
- **Safe Fallback for `head_dim`**:
  If `head_dim` is missing from metadata but `hidden_size` and `num_attention_heads` exist:
  $$\text{head\_dim} = \frac{\text{hidden\_size}}{\text{num\_attention\_heads}}$$
  When this fallback is applied, an entry is added to `assumptions` and confidence is lowered.

---

### 2.3 Activation Memory Model
Activation memory during inference depends on batch size, context length, hidden dimension, and runtime execution strategy.

- **Transformers**:
  $$\text{Base} (0\,\text{bytes}) + 2 \times \text{batch\_size} \times \text{context\_length} \times \text{hidden\_size} \times \text{layers} \times 0.05$$
  Conservative forward inference workspace estimate [TODO(verify)].
- **llama.cpp**:
  $$\text{Base} (128\,\text{MiB}) + \text{batch\_size} \times \text{context\_length} \times \text{hidden\_size} \times 2$$
  Models dynamic ring workspace buffers [TODO(verify)].
- **vLLM**:
  $$\text{Base} (256\,\text{MiB}) + \text{batch\_size} \times \text{context\_length} \times \text{hidden\_size} \times 2$$
  Models intermediate activation tensors during multi-request batching [TODO(verify)].

---

### 2.4 Runtime Overhead Model
Runtime overhead captures driver contexts, execution engine workspaces, and runtime frameworks:

- **llama.cpp**: $256\,\text{MiB}$ ($268{,}435{,}456$ bytes) CUDA/Metal driver and GGML context [TODO(verify)].
- **vLLM**: $1024\,\text{MiB}$ ($1{,}073{,}741{,}824$ bytes) PyTorch CUDA context, NCCL buffers, and engine workspace [TODO(verify)].
- **Transformers**: $512\,\text{MiB}$ ($536{,}870{,}912$ bytes) PyTorch runtime context and memory allocator overhead [TODO(verify)].

> **Important Runtime Warning on vLLM**:
> By default, vLLM configures `gpu_memory_utilization = 0.90`, immediately pre-allocating 90% of total GPU VRAM for its internal KV cache block pool upon startup regardless of the active context length. Our estimate computes the *theoretical minimum memory footprint* required to hold the model, context, and scratch buffers. In production with vLLM, memory allocation will expand to fill the configured utilization limit.

---

### 2.5 Multi-GPU / Tensor Parallelism
When running across multiple GPUs with tensor parallelism:
- **Validation**:
  - `gpu_count >= 1`
  - `tensor_parallel_degree >= 1`
  - `tensor_parallel_degree <= gpu_count` (tensor-parallel degree cannot exceed total GPUs)
  - If `num_kv_heads` is provided and $`\text{num\_kv\_heads} \bmod \text{tensor\_parallel\_degree} \ne 0`$, a warning is appended noting potential head imbalance.
- **Sharding Rules**:
  - $\text{Weights per Device} = \lfloor \frac{\text{weights\_bytes}}{\text{tensor\_parallel\_degree}} \rfloor$
  - $\text{KV Cache per Device} = \lfloor \frac{\text{kv\_cache\_bytes}}{\text{tensor\_parallel\_degree}} \rfloor$
  - $\text{Activations per Device} = \lfloor \frac{\text{activation\_bytes}}{\text{tensor\_parallel\_degree}} \rfloor$
  - $\text{Per-Device Total} = \text{Weights per Device} + \text{KV Cache per Device} + \text{Activations per Device} + \text{runtime\_overhead\_bytes}$

---

### 2.6 Verdict Thresholds & Headroom
Let:
$$\text{Usable Memory} = \text{memory\_bytes} - \text{reserved\_memory\_bytes}$$
$$\text{Usage Ratio} = \frac{\text{total\_bytes}}{\text{Usable Memory}}$$

- **Verdict Rules**:
  - `cannot_estimate`: If required fields are missing or architecture is unsupported.
  - `fits`: $\text{Usage Ratio} \le 0.90$
  - `fits_tight`: $0.90 < \text{Usage Ratio} \le 1.00$
  - `does_not_fit`: $\text{Usage Ratio} > 1.00$
- **Headroom**:
  - When verdict is `cannot_estimate`: $\text{headroom} = 0$ (undefined headroom).
  - Otherwise: $\text{headroom} = \text{Usable Memory} - \text{total\_bytes}$ (can be negative if `does_not_fit`).

---

### 2.7 Confidence Level Derivation
Confidence is derived strictly from the number of fallback assumptions applied during estimation:
- **`high`**: 0 assumptions made. All parameters came directly from verified metadata.
- **`medium`**: Exactly 1 assumption applied (e.g. `head_dim` calculated via `hidden_size / heads`).
- **`low`**: 2 or more assumptions applied.

---

### 2.8 Warnings & Validation Rules
- **Context Length Limit**: If `config.context_length > model.max_context_length`, append a warning: `"Requested context length ({context_length}) exceeds model max_context_length ({max_context_length}). May cause degraded output or attention extrapolation errors."`
- **Unsupported Architectures**:
  - Multi-Head Latent Attention (MLA e.g. DeepSeek-V2/V3): return `cannot_estimate` with `UNSUPPORTED_ARCHITECTURE_MLA`.
  - State Space Models (SSM e.g. Mamba): return `cannot_estimate` with `UNSUPPORTED_ARCHITECTURE_SSM`.
  - Hybrid SSM-Transformer: return `cannot_estimate` with `UNSUPPORTED_ARCHITECTURE_HYBRID`.
  - Multimodal Vision-Language Models: return `cannot_estimate` with `UNSUPPORTED_ARCHITECTURE_MULTIMODAL`.

---

## 3. Model Support Classification & Stable Reason Codes

ModelFit provides deterministic classification for Hugging Face Hub repositories before memory estimation. Unsupported architectures and incomplete metadata are first-class outcomes with explicit reason codes, never crashes or HTTP 500s.

### 3.1 Stable Reason Codes to SupportStatus Mapping

| Stable Reason Code | Mapped `support_status` | Description & Criteria |
| :--- | :--- | :--- |
| `MISSING_CONFIG` | `incomplete_metadata` | Hub model repo info returned 200, but `config.json` was not found (HTTP 404). Typical of non-standard repo layouts (e.g. ComfyUI pipelines). |
| `MALFORMED_CONFIG` | `incomplete_metadata` | `config.json` was returned but could not be parsed as valid JSON. |
| `INCOMPLETE_METADATA` | `incomplete_metadata` | `config.json` is missing mandatory architecture dimensions (`num_hidden_layers`, `hidden_size`, or `num_attention_heads`). |
| `UNSUPPORTED_MODALITY` | `unsupported_modality` | Model pipeline tag corresponds to non-text modalities (e.g. `automatic-speech-recognition`, `text-to-image`, `video-classification`). |
| `UNSUPPORTED_ENCODER_ONLY` | `unsupported_modality` | Model is an encoder-only architecture (e.g. BERT, RoBERTa, DeBERTa, sentence-transformers); autoregressive KV-cache estimation does not apply. |
| `UNSUPPORTED_ARCHITECTURE` | `unsupported_architecture` | Model architecture is an unsupported sequence model or attention mechanism (e.g. Mamba/SSM, DeepSeek MLA, LLaVA multimodal). |
| *(None)* | `supported_llm` | Recognized autoregressive causal decoder LLM (Qwen, Llama, Gemma, Phi, Mistral, Mixtral MoE) with complete metadata. |
| *(None)* | `not_checked` | Transient state on catalog list cards before repository `config.json` has been inspected or cached. |

