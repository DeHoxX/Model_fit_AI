"""Constants and configuration weights for deterministic recommendation scoring.

NOTE: All weights, headroom penalty boundaries, and default parameters in this file
are explicit architectural design choices, not empirical laws or external standards.
See docs/RECOMMENDATION_SCORING.md for details.
"""

# Scoring weights (sum to 1.0)
WEIGHT_HEADROOM: float = 0.45
WEIGHT_DOWNLOADS: float = 0.25
WEIGHT_RECENCY: float = 0.15
WEIGHT_LICENSE: float = 0.15

# Headroom scoring thresholds (as fraction of total device memory)
OPTIMAL_HEADROOM_MIN: float = 0.15  # 15% headroom is lower bound of sweet spot
OPTIMAL_HEADROOM_MAX: float = 0.30  # 30% headroom is upper bound of sweet spot
MIN_SAFE_HEADROOM: float = 0.05  # Below 5% is penalized heavily

# Hub query bounding
MAX_CANDIDATES: int = 8  # Max candidates inspected per recommendation request
HUB_CONCURRENCY_LIMIT: int = 3  # Bounded concurrency for Hub detail/safetensors fetches

# Task heuristic search query terms (TODO(verify): boolean OR is not supported by Hub API)
TASK_SEARCH_TERMS: dict[str, list[str]] = {
    "coding": ["coder", "code"],
    "general": ["instruct", "chat"],
    "reasoning": ["reasoning", "math"],
    "writing": ["instruct", "creative"],
}

# License scoring lookup tables
LICENSE_SCORES_ANY: dict[str, float] = {
    "permissive": 1.0,  # MIT, Apache-2.0, BSD
    "open_weights": 1.0,  # Llama, Mistral, Gemma open-weight licenses
    "other": 0.8,
    "unknown": 0.5,  # When license is None
}

LICENSE_SCORES_PERMISSIVE: dict[str, float] = {
    "permissive": 1.0,
    "open_weights": 0.2,
    "other": 0.0,
    "unknown": 0.0,  # When license is None and user requested permissive
}

LICENSE_SCORES_OPEN_WEIGHTS: dict[str, float] = {
    "permissive": 1.0,
    "open_weights": 1.0,
    "other": 0.3,
    "unknown": 0.1,
}

PERMISSIVE_LICENSES: set[str] = {
    "mit",
    "apache-2.0",
    "bsd",
    "bsd-2-clause",
    "bsd-3-clause",
    "isc",
    "unlicense",
}

OPEN_WEIGHT_LICENSES: set[str] = {
    "llama3",
    "llama3.1",
    "llama3.2",
    "llama3.3",
    "llama2",
    "mistral",
    "gemma",
    "apple-ascl",
    "qwen",
}
