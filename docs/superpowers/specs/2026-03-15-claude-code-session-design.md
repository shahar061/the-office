# Claude Code Session Creation — Design Spec

**Date:** 2026-03-15
**Status:** Draft

## Overview

Add the ability to spawn and manage Claude Code sessions from the app, completing the second tool integration alongside the existing OpenCode support. The user picks a directory, types a prompt, and the app spawns a persistent `claude` subprocess — piping prompts via stdin and parsing structured JSON events from stdout.

## Architecture

### New: `ClaudeCodeProcess`

A new class at `electron/adapters/claude-code-process.ts` that wraps a single persistent `claude` subprocess.

**Responsibilities:**
- Spawn `claude --output-format stream-json` with `cwd` set to the user's chosen directory
- Hold a reference to the `ChildProcess`
- Write prompts to `stdin`
- Parse JSONL events from `stdout` line-by-line
- Emit `AgentEvent`s through an EventEmitter (same pattern as existing adapters)
- Extract `session_id` from the `init` event immediately — no directory/timestamp linking heuristic needed
- Handle process exit (expected or unexpected)

**Not an adapter:** Unlike `ClaudeCodeTranscriptAdapter` or `OpenCodeAdapter`, this is not a polling/watching adapter. It's a process wrapper with a direct I/O channel to a single session.

### Existing: `ClaudeCodeTranscriptAdapter`

Stays running unchanged. It continues watching `~/.claude/projects/**/*.jsonl` for sessions started outside the app (e.g. from terminal). For app-spawned sessions, `ClaudeCodeProcess` is the sole event source — the transcript adapter may also pick up the same session from disk, but the renderer already filters events by `selectedSessionId` so there's no conflict.

## Process Lifecycle

### Session Creation

```
LobbyFAB: User clicks Start (tool='claude-code', directory='/path/to/project')
  → main.ts: pendingSession = { tool: 'claude-code', directory, createdAt }
  → renderer: navigates to OfficeScreen, shows "waiting for first prompt"
```

### First Prompt

```
PromptInput: User types prompt, hits Send
  → DISPATCH handler (tool === 'claude-code'):
    1. Spawn: claude --output-format stream-json  (cwd = directory)
    2. Create ClaudeCodeProcess instance, store in claudeProcessMap
    3. Listen for 'init' event on stdout → extract session_id
    4. Emit agent:created, send SESSION_LINKED to renderer (immediate, no matching)
    5. Write prompt + newline to stdin
```

### Subsequent Prompts

```
PromptInput: User sends another prompt
  → DISPATCH handler:
    1. Find existing ClaudeCodeProcess by sessionId
    2. Write prompt + newline to stdin
    3. Events flow from stdout parsing as before
```

### Termination

```
User clicks Back / navigates to lobby
  → CANCEL_SESSION handler:
    1. Send SIGTERM to the claude process
    2. Remove from claudeProcessMap
    3. Emit agent:closed
    4. Clean up stdout/stderr listeners
```

### Resuming a Previous Session

```
User clicks a stale Claude Code session in SessionPanel
  → First prompt spawns: claude --output-format stream-json --resume <session-id>
  → Same lifecycle as above, but continues previous conversation context
```

## Event Mapping

Claude's `stream-json` format outputs one JSON object per line. Each maps to an `AgentEvent`:

| stream-json event | AgentEvent type | Extracted data |
|---|---|---|
| `{"type":"system","subtype":"init","session_id":"..."}` | `agent:created` | sessionId; agentRole from pendingSession |
| `{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read",...}]}}` | `agent:tool:start` | toolName from content block |
| `{"type":"tool_result","tool_use_id":"..."}` | `agent:tool:done` | toolName (matched from prior tool_use), status |
| `{"type":"assistant","message":{"content":[{"type":"text","text":"..."}]}}` | `agent:message` | message text |
| `{"type":"result","total_cost":0.05,...}` | `session:cost:update` + `agent:waiting` | cost, tokens |

Note: `tool_result` is a **top-level event type**, not nested inside an assistant message content array. The parser must track the last `tool_use` name to correlate `tool_result` events back to their tool.

**Content block iteration:** A single assistant message can contain multiple content blocks (text + tool_use interleaved). The parser iterates over the `content` array and emits one `AgentEvent` per block.

**Permission events:** Claude Code may emit permission request events when a tool needs user approval. These map to `agent:permission` with the tool name and ID, allowing the renderer to show approval/denial UI. This is a placeholder — the existing `approvePermission` / `denyPermission` IPC handlers are not yet wired to the subprocess. For now, the process handles permissions internally (via its own TTY if available, or auto-approve flags). Full permission delegation is out of scope for this iteration.

**Source field:** All events use `source: 'claude-process'`. This distinguishes app-spawned sessions from transcript-adapter-discovered sessions in the `SessionManager.sessions` map, avoiding silent collisions. Requires adding `'claude-process'` to the `AgentEvent.source` union in `shared/types.ts`.

**Error handling:**
- `stderr` output → log as warning; surface via `DISPATCH_ERROR` if it indicates a fatal issue
- Unexpected process exit (non-zero code) → emit `agent:closed`, send `DISPATCH_ERROR` to renderer, remove from `claudeProcessMap`, clear `dispatchInFlight` in renderer
- Spawn failure (e.g. `claude` not found in PATH) → send `DISPATCH_ERROR` immediately
- `stdin.write()` failure (process already exited) → catch error, emit `agent:closed`, send `DISPATCH_ERROR`
- If crash occurs before `init` event (no sessionId yet) → send `DISPATCH_ERROR`, navigate user back to lobby

## Integration Points

### `electron/main.ts` — DISPATCH handler

Refactor the existing DISPATCH handler into tool-aware branching. The current handler is entirely OpenCode-centric (uses `dispatchInFlight`, linking timer, directory+timestamp matching). These mechanics are **OpenCode-specific** and do not apply to Claude Code.

```
if (pendingSession.tool === 'claude-code') {
  // Claude Code path: immediate session linking, no heuristic
  if (!activeClaudeProcess) {
    // First dispatch: spawn process, wait for init event, then write prompt
    activeClaudeProcess = new ClaudeCodeProcess(directory)
    // init event → SESSION_LINKED immediately (no timer, no dispatchInFlight)
  }
  activeClaudeProcess.sendPrompt(prompt)
} else if (pendingSession.tool === 'opencode') {
  // OpenCode path: unchanged (spawn opencode run, linking timer, dispatchInFlight)
}
```

Key difference: Claude Code gets its `session_id` from the `init` stdout event — no `linkingTimer`, no `dispatchInFlight` flag, no `SESSION_LINK_FAILED` timeout. The `SESSION_LINKED` event is sent as soon as `init` is parsed.

**`claudeProcessMap` vs `activeProcesses`:** The existing `activeProcesses` is a `Set<ChildProcess>` used to kill OpenCode subprocesses on cancel. A new `claudeProcessMap: Map<string, ClaudeCodeProcess>` (keyed by sessionId) stores Claude Code processes. This is separate from `activeProcesses` because Claude Code processes need to be looked up by sessionId for subsequent prompt writes, not just bulk-killed. On `CANCEL_SESSION`, both the `claudeProcessMap` entry and any `activeProcesses` entries are cleaned up.

The `CANCEL_SESSION` handler gains a check: if the active process is a `ClaudeCodeProcess`, kill it via SIGTERM, remove from `claudeProcessMap`, and clean up event listeners.

**Temporary agentId:** Between spawning the process and receiving the `init` event, a synthetic `agentId` of `'pending-claude'` is used. All events emitted before `init` are buffered internally by `ClaudeCodeProcess` and replayed with the real `session_id` once known. In practice, the `init` event arrives before any assistant events, so buffering is a safety net.

### `LobbyFAB.tsx`

Remove the `disabled` prop from the Claude Code tool button. The rest of the flow (directory picker, Start button, `createSession` call) already works generically with the `tool` field.

### `shared/types.ts`

Add `'claude-process'` to both the `AgentEvent.source` and `SessionInfo.source` union types (`'sdk' | 'transcript' | 'opencode' | 'claude-process'`). `SessionManager` copies `event.source` into `SessionInfo`, so both unions must match. All other types are already sufficient.

### Stores

No changes. `useOfficeStore.handleAgentEvent()` and `useChatStore.handleAgentEvent()` handle all event types generically. The `ClaudeCodeProcess` emits the same `AgentEvent` shape.

## New Files

| File | Purpose | Est. size |
|---|---|---|
| `electron/adapters/claude-code-process.ts` | Persistent subprocess wrapper, JSONL parser, event emitter | ~150 lines |

## Modified Files

| File | Change |
|---|---|
| `electron/main.ts` | Refactor DISPATCH into tool-aware branching + CANCEL handler |
| `shared/types.ts` | Add `'claude-process'` to `AgentEvent.source` and `SessionInfo.source` unions |
| `src/renderer/src/components/LobbyFAB/LobbyFAB.tsx` | Enable Claude Code button |

## Out of Scope

- Multi-session support (multiple concurrent Claude Code processes)
- Claude Code SDK integration (we use the CLI)
- Modifying the `ClaudeCodeTranscriptAdapter`
- Changes to the office visualization or character system
