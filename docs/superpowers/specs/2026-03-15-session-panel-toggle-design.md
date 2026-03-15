# Session Panel Toggle — Design Spec

**Date:** 2026-03-15
**Status:** Draft

## Overview

Add source-aware session listing and filtering to the SessionPanel. Claude Code sessions (from transcript files) appear alongside OpenCode sessions in a unified list, with pill-toggle filters and source badges.

## Data Layer

### `SessionListItem` type change

Add a required `source` field to `SessionListItem` in `shared/types.ts`:

```typescript
export interface SessionListItem {
  sessionId: string;
  title: string;
  directory: string;
  projectName: string;
  status: 'busy' | 'waiting' | 'stale';
  lastUpdated: number;
  createdAt: number;
  source: 'opencode' | 'claude-code';
}
```

Required (not optional) — both adapters always set it, avoiding null-checks in filter and linking logic.

### `ClaudeCodeTranscriptAdapter` — emit session list

The adapter currently only emits `AgentEvent`s. It needs to also call `emitSessionList()` with `SessionListItem` entries built from discovered transcript files.

**Startup behavior:** Change `ignoreInitial` from `true` to `false` in the chokidar watcher so existing transcript files are discovered on app launch (not just new ones).

When a transcript file is discovered or changes, build a `SessionListItem`:
- **sessionId:** Filename without extension (e.g. `abc123.jsonl` → `abc123`)
- **directory:** Decoded from the parent path. Claude Code encodes the project path by replacing `/` with `-` in the directory name under `~/.claude/projects/`. Example: `~/.claude/projects/-Users-shahar-Projects-my-app/abc123.jsonl` → `/Users/shahar/Projects/my-app`
- **projectName:** Last segment of the decoded directory (e.g. `my-app`)
- **title:** The session ID (or first assistant message if available from the JSONL)
- **status:** Based on file modification time:
  - `'busy'`: modified < 30 seconds ago
  - `'waiting'`: 30 seconds <= modified < 10 minutes ago
  - `'stale'`: modified >= 10 minutes ago
- **lastUpdated / createdAt:** File modification / creation timestamps via `fs.statSync`
- **source:** `'claude-code'`

The adapter maintains a `Map<string, SessionListItem>` of known sessions and re-emits the full list on every file change event.

### `OpenCodeAdapter` — set source field

The OpenCode adapter must set `source: 'opencode'` on each emitted `SessionListItem`. This is a one-line addition where the adapter builds session objects.

### Session merging in `SessionManager`

The `SessionManager` receives `sessionListUpdate` events from multiple adapters. Currently it forwards them directly. Since both adapters now emit session lists, the manager must merge them.

- Maintain a per-adapter session list: `Map<ToolAdapter, SessionListItem[]>`
- On any adapter's `sessionListUpdate`, update that adapter's entry and emit the merged (concatenated) list

### Session linking safety in `main.ts`

The existing session linking logic in `main.ts` matches by directory + createdAt. With merged lists, it could false-match a Claude Code session to a pending OpenCode dispatch (or vice versa). Fix: add a `source` check:

```typescript
const match = sessions.find(s =>
  s.source === (pendingSession.tool === 'claude-code' ? 'claude-code' : 'opencode') &&
  s.directory === pendingSession.directory &&
  s.createdAt > pendingSession.createdAt - 2000
);
```

## Store

### `useSessionStore` changes

Add `filter` state and a derived selector:

```typescript
interface SessionStoreState {
  sessions: SessionListItem[];
  filter: 'all' | 'opencode' | 'claude-code';
  setFilter: (filter: 'all' | 'opencode' | 'claude-code') => void;
  handleSessionListUpdate: (sessions: SessionListItem[]) => void;
  reset: () => void;
}
```

Components use a filtering selector:
```typescript
const filtered = useSessionStore(s =>
  s.filter === 'all' ? s.sessions : s.sessions.filter(x => x.source === s.filter)
);
```

## UI

### SessionPanel header

Replace the static "Building Directory" header with a row containing:
- The title "Sessions" (left-aligned)
- Two pill-toggle buttons: **OC** (OpenCode) and **CC** (Claude Code) (right-aligned)

**Toggle behavior:**
- Default: both pills are inactive → show all sessions
- Click one pill → activates it, filters to that source only
- Click the active pill → deactivates it, returns to showing all
- Only one pill active at a time (not a multi-select)

**Pill styling:** Matches the existing tool selector pattern in LobbyFAB — selected pill gets blue border + blue text, unselected gets dim border + gray text.

### SessionCard source badge

Each session card shows a small badge in the top-right corner:
- **OC** for OpenCode sessions (teal/cyan color)
- **CC** for Claude Code sessions (blue/purple color)

The badge is 2-letter text, small font (9px), with a subtle background pill shape.

## Files Changed

| File | Change |
|---|---|
| `shared/types.ts` | Add required `source` to `SessionListItem` |
| `electron/adapters/claude-transcript.adapter.ts` | Emit session list from transcript files, `ignoreInitial: false` |
| `electron/adapters/opencode.adapter.ts` | Set `source: 'opencode'` on emitted sessions |
| `electron/session-manager.ts` | Merge session lists from multiple adapters |
| `electron/main.ts` | Add `source` check to session linking logic |
| `src/renderer/src/stores/session.store.ts` | Add `filter` state + filtering selector |
| `src/renderer/src/components/SessionPanel/SessionPanel.tsx` | Filter pills + source badges |

## Out of Scope

- Sorting or searching sessions
- Session deletion or archival
- Claude Code session resumption from the panel (clicking navigates to office but doesn't auto-resume the terminal)
- Changes to auto-navigate-to-lobby logic (existing `selectedSessionTool` guard remains sufficient)
