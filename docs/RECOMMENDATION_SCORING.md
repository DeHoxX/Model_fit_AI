# Model Recommendation Scoring System

## Overview
ModelFit provides a deterministic multi-objective ranking algorithm for filtering and scoring candidate models from the Hugging Face Hub against user-specified hardware and functional requirements.

The recommendation engine is strictly deterministic: given identical Hugging Face metadata, hardware specs, and user preferences, the algorithm always produces the exact same ranked candidates with identical numerical scores.

---

## Scoring Formula & Weights

Each candidate model is assigned a composite score $S \in [0.0, 1.0]$:

$$S = (w_{\text{headroom}} \times S_{\text{headroom}}) + (w_{\text{downloads}} \times S_{\text{downloads}}) + (w_{\text{recency}} \times S_{\text{recency}}) + (w_{\text{license}} \times S_{\text{license}})$$

### Configured Weights
* **$w_{\text{headroom}} = 0.45$ (Headroom & Fit Margin)**: Highest priority. Models that comfortably fit within available hardware without triggering out-of-memory errors or starving system processes receive the highest score.
* **$w_{\text{downloads}} = 0.25$ (Community Adoption)**: Popular, widely-adopted community models receive preference. Logarithmic scaling prevents mega-downloads from drowning out all other factors.
* **$w_{\text{recency}} = 0.15$ (Ecosystem Freshness)**: Newer model architectures and recent checkpoints receive a boost over abandoned repositories.
* **$w_{\text{license}} = 0.15$ (License Alignment)**: Match with the user's declared usage preference (commercial/permissive vs open weights).

The sum of weights equals exactly $1.00$.

---

## Sub-Score Calculations

### 1. Headroom Score ($S_{\text{headroom}}$)
Let:
* $M_{\text{avail}}$ = Available hardware memory in bytes (total memory minus system reserved).
* $M_{\text{est}}$ = Estimated model total memory in bytes (weights + KV cache + context activation peak).
* $\text{ratio} = \frac{M_{\text{est}}}{M_{\text{avail}}}$

The curve rewards healthy headroom while penalizing both OOM risk and excessive under-utilization:
* **Over-budget ($\text{ratio} > 1.0$)**: $S_{\text{headroom}} = 0.0$ (Candidate is dropped by OOM filter).
* **Sweet spot ($0.65 \le \text{ratio} \le 0.85$)**: $S_{\text{headroom}} = 1.0$ (Optimal utilization: 15%–35% safety margin).
* **Tight fit ($0.85 < \text{ratio} \le 1.0$)**:
  $$S_{\text{headroom}} = 1.0 - \left(\frac{\text{ratio} - 0.85}{0.15}\right) \times 0.5$$
  (Linearly scales down from 1.0 to 0.5; candidate receives a `fits_tight` warning flag).
* **Under-utilization ($\text{ratio} < 0.65$)**:
  $$S_{\text{headroom}} = \max\left(0.4, 1.0 - \left(\frac{0.65 - \text{ratio}}{0.65}\right) \times 0.6\right)$$
  (Prevents recommending tiny 100M parameter models when a user has a 24GB GPU, while still assigning at least 0.4).

### 2. Downloads Score ($S_{\text{downloads}}$)
Logarithmic normalization capping at 1,000,000 downloads:
$$S_{\text{downloads}} = \min\left(1.0, \frac{\log_{10}(\max(1, \text{downloads}))}{6.0}\right)$$

### 3. Recency Score ($S_{\text{recency}}$)
Recency is not yet implemented in the catalog schema (assigned neutral 0.5 for all candidates). Linear decay formula will activate once `last_modified` date is parsed into model metadata:
$$S_{\text{recency}} = \max\left(0.1, 1.0 - \frac{\text{age\_in\_days}}{365.0}\right)$$

### 4. License Score ($S_{\text{license}}$)
License scoring maps `license_preference` in `RequirementSpec` to the model's reported Hugging Face license string.

#### License Categories:
* **Permissive** (`apache-2.0`, `mit`, `bsd`, `bsd-3-clause`, `cc-by-4.0`): Fully unrestricted commercial and research use.
* **Open Weights / Community** (`llama3`, `llama3.1`, `llama3.2`, `llama2`, `gemma`, `mistral`, `deepseek`, `openrail`): Commercial use permitted under custom open-weight licenses with user-scale restrictions.
* **Non-Commercial / Other** (`cc-by-nc-4.0`, etc.): Research only.

#### Scoring Matrix:
| `license_preference` | Permissive License | Open Weights License | Non-Commercial License | Unknown / `None` |
| :--- | :--- | :--- | :--- | :--- |
| **`permissive`** | 1.00 | 0.20 | 0.00 | **0.00** |
| **`open_weights`** | 1.00 | 1.00 | 0.10 | **0.10** |
| **`any`** (default) | 1.00 | 0.90 | 0.60 | **0.50** |

#### Design Choice: Handling `license: None` / Unknown
When Hugging Face metadata omits a license tag or reports `None`:
1. If the user explicitly requested `permissive` commercial use, missing license scores **0.00** to eliminate compliance risks.
2. If the user requested `open_weights`, missing license scores **0.10** as an unverified fallback.
3. If the user specified `any`, missing license scores neutral **0.50**.

---

## Filtering Pipeline

Before scoring and ranking:
1. **Support Check**: Models marked `is_supported=False` or `support_status != "supported_llm"` are immediately dropped. The count is recorded in `dropped_unsupported_count` and reason strings in `unsupported_reasons`.
2. **Deterministic Estimation**: Memory requirements are calculated via `modules/estimator/calculator.py` using standard Q4_K_M weights, 2048 default context, and batch size 1.
3. **OOM Filter**: Models exceeding available hardware memory ($\text{ratio} > 1.0$) are dropped. The count is recorded in `dropped_oom_count`.
4. **Ranking & Truncation**: Valid models are sorted descending by $S$. The top $N$ (capped at `max_candidates=8`) are returned in `recommendations`.
