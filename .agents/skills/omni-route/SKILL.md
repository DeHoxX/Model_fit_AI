---
name: omni-route
description: Unified AI router, model gateway, and proxy for dynamic routing, free model aggregation, auto-fallback, route simulation, and MCP tool integration.
---

# OmniRoute AI Gateway & Dynamic Router

OmniRoute is an open-source, local-first AI gateway and API proxy that aggregates hundreds of AI providers and models behind a single OpenAI-compatible endpoint with automatic fallback, token compression, and MCP support.

## Endpoints & Services

- **Web Dashboard**: `http://localhost:20128`
- **OpenAI-Compatible API Base**: `http://localhost:20128/v1`
- **Models Endpoint**: `http://localhost:20128/v1/models`
- **Chat Completions**: `http://localhost:20128/v1/chat/completions`
- **Data & Configuration**: `C:\Users\chief\.omniroute\`

## Core Capabilities

1. **Dynamic Routing & Free Models**:
   - Access free tiers across multiple providers (Google Gemini Free, Groq, OpenRouter Free models, Mistral, Cloudflare, DeepSeek, Together, Cohere, etc.).
   - Automatic fallback across accounts and providers when rate limits, token quotas, or errors occur.

2. **CLI Commands**:
   - `omniroute status`: Inspect server, database, and installed CLI tools.
   - `omniroute serve --daemon --no-open`: Run server as a persistent background daemon.
   - `omniroute providers`: List and configure provider connections.
   - `omniroute keys`: Manage API keys.
   - `omniroute simulate "prompt"`: Simulate routing without invoking upstream APIs.
   - `omniroute doctor`: Run diagnostics on runtime and dependencies.
   - `omniroute dashboard`: Open management UI in browser.

3. **MCP Integration**:
   - Registered in Antigravity MCP servers as `omniroute`.
   - Exposes route simulation, provider metrics, session inspection, and gateway search tools.
