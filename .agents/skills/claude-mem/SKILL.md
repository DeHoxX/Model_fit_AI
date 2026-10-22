---
name: claude-mem
description: Access and persist cross-session context, project decisions, architectural memory, and past observations using the claude-mem system and MCP tools (mem_search, save_memory, get_observations).
---

# Claude-Mem Context Memory

This skill enables Antigravity to utilize `claude-mem` for persistent, cross-session memory and context continuity.

## Core Capabilities

1. **Search Prior Memory (`mem_search`)**:
   Query past observations, architectural choices, and resolved bugs from previous sessions:
   - Guided mode: `mem_search(query="...", project="...", mode="guided")`
   - Auto mode: `mem_search(query="...", project="...", mode="auto", limit=10, maxDetails=3)`

2. **Retrieve Context (`get_observations`)**:
   Fetch specific stored observations and transcripts for identified IDs.

3. **Save Durable Knowledge (`save_memory`)**:
   Store critical project facts, decisions, and constraints for future sessions:
   - `save_memory(title="...", text="...", project="...")`

## Memory Storage Location
Local SQLite databases, vectors, and transcripts are stored in:
`C:\Users\chief\.claude-mem\`
