# System Architecture

## Overview
ModelFit is designed with strict boundaries, separation of concerns, and guaranteed deterministic outputs.

```mermaid
graph TD
    User["User Browser"] -->|HTTP / :3000| Web["Next.js Web Frontend"]
    Web -->|Rewrites /api/*| Caddy["Caddy Gateway / Reverse Proxy"]
    Caddy -->|/api/v1/*| API["FastAPI Application"]
    
    subgraph "API Core & Modules"
        API --> Middleware["RequestID & Security Headers Middleware"]
        Middleware --> Health["modules/health"]
        Middleware --> Catalog["modules/catalog"]
        Middleware --> Estimator["modules/estimator (PURE)"]
        Middleware --> Configs["modules/configs"]
        Middleware --> Chat["modules/chat"]
        Middleware --> Recommend["modules/recommend"]
        Middleware --> Admin["modules/admin"]
    end
    
    subgraph "Storage"
        API --> DB[(PostgreSQL 16)]
    end
```

## Layering Convention
Inside each backend module:
1. `router.py`: HTTP-only handling, parameter parsing, dependency injection, and HTTP response envelopes.
2. `service.py`: Domain and business logic.
3. `repository.py`: Async database access via SQLAlchemy models.

Modules talk to each other only through service interfaces. The `modules/estimator` is strictly pure: no imports from FastAPI, SQLAlchemy, httpx, or huggingface_hub.
