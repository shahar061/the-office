# OpenCode Session Lobby Design

## Overview

Add a two-screen architecture to The Office app: a **Building Lobby** screen for selecting OpenCode sessions, and the existing **Office** screen for viewing a selected session's activity. The lobby shows all non-archived, top-level OpenCode sessions across all projects, with activity status detection.

## Architecture

### Screen Navigation

A new `app.store.ts` manages screen state:

- `screen: 'lobby' | 'office'`
- `selectedSessionId: string | null`
- `selectedSessionTitle: string | null`
- `navigateToOffice(sessionId, title)` — switches to office, resets office and chat stores
- `navigateToLobby()` — switches to lobby, clears selection, resets office, chat, and kanban stores

`App.tsx` conditionally renders:
- `screen === 'lobby'` → `<LobbyScreen />`
- `screen === 'office'` → `<OfficeScreen />` (TopBar with back button + ChatPanel + OfficeCanvas + StatsOverlay)

When navigating between screens, the leaving screen's PixiJS Application is unmounted and destroyed. Only one PixiJS Application exists at a time — LobbyCanvas and OfficeCanvas never coexist.

### Lobby Screen

**Layout:** Two panels side by side.

- **Left: Session Panel (~320px)** — HTML/CSS side panel listing sessions as "company" cards
- **Right: Lobby Canvas (fills remaining)** — PixiJS pixel art lobby scene

**Session Panel:**
- Header text (e.g., "Building Directory")
- Session cards grouped by project directory, sorted by last activity
- Each card shows:
  - Project name (bold, derived via `path.basename(session.directory)`)
  - Session title (smaller text)
  - Status dot: green pulsing = busy, amber = waiting, gray = stale
  - Relative timestamp ("2 min ago")
- Clicking a card calls `navigateToOffice()`
- Empty state when no sessions exist

**Lobby PixiJS Scene:**
- Minimal pixel art: lobby floor tiles, back wall, reception desk
- Static concierge character behind the desk
- No interactivity — purely atmospheric
- `lobby-layout.json` follows the same TileMap format as `office-layout.json`

### Office Screen

Extracted from current `App.tsx`. Contains:
- `<TopBar />` — gains a "Back to Lobby" button
- `<ChatPanel />`
- `<OfficeCanvas />`
- `<StatsOverlay />`

Chat panel is only visible on this screen.

## OpenCode Adapter Changes

### Remove Directory Filter

The adapter currently filters `WHERE directory = projectDir`. This changes to:

```sql
SELECT id, title, directory, project_id, time_created, time_updated
FROM session
WHERE parent_id IS NULL AND time_archived IS NULL
ORDER BY time_updated DESC
```

This returns all top-level, non-archived sessions across all projects.

### Session List Event

The session list flows through a **dedicated event path**, separate from `AgentEvent`:

1. `ToolAdapter` gains a new method: `emitSessionList(sessions: SessionListItem[])`
2. The OpenCode adapter calls `this.emitSessionList(sessions)` on every poll cycle
3. `SessionManager` listens for `'sessionListUpdate'` on each adapter and re-emits it
4. `main.ts` listens on `sessionManager.on('sessionListUpdate', ...)` and forwards to the renderer via `mainWindow.webContents.send(IPC_CHANNELS.SESSION_LIST_UPDATE, sessions)`

This is completely separate from the `AgentEvent` pipeline. `AgentEvent` and `AgentEventType` are **not modified**.

### Activity Status Detection

Per session, each poll cycle, query the last part using parameterized queries:

```sql
SELECT data, time_updated FROM part WHERE session_id = ? ORDER BY time_updated DESC LIMIT 1
```

This is a standalone query that parses `part.data` JSON inline — it does not use the existing `processPart` pipeline.

- Last part is `step-start` or `step-finish` with `reason=tool-calls` → **busy**
- Last part is `step-finish` with `reason=stop` and `time_updated` within 10 minutes → **waiting**
- Otherwise → **stale**

**Performance note:** To avoid N+1 queries per poll cycle, the adapter should cache the previous session list and only re-query parts for sessions whose `time_updated` has changed since the last poll.

### SQL Safety

All SQL queries in the adapter must use parameterized queries (`?` placeholders) instead of string interpolation. The existing string-interpolated queries should be migrated as part of this work.

### Office-Mode Filtering

When in the office, the adapter continues polling all sessions (for the lobby list), but per-session `agent:*` events are still emitted as today. Event filtering happens at the renderer level (see Data Flow section).

## Data Flow

### IPC

New channel: `SESSION_LIST_UPDATE: 'office:session-list-update'`

New preload method: `window.office.onSessionListUpdate(callback)` — returns a cleanup function, matching existing pattern.

### Store Architecture

**`app.store.ts`** — screen navigation state (lobby/office, selected session).

**`session.store.ts`** — holds the session list from the adapter:
```typescript
interface SessionStoreState {
  sessions: SessionListItem[];
  handleSessionListUpdate(sessions: SessionListItem[]): void;
}
```

**`office.store.ts`** — existing store, modified to reset on navigation. No filtering logic inside the store.

**`chat.store.ts`** — existing store, reset when navigating to/from lobby via `navigateToLobby()`.

**`kanban.store.ts`** — existing store, reset when navigating to/from lobby via `navigateToLobby()`.

### Renderer Event Routing (`main.tsx`)

- `onSessionListUpdate` → `session.store.handleSessionListUpdate`
- `onAgentEvent` → **filtered before dispatch**: check `useAppStore.getState().selectedSessionId`; only forward to `office.store.handleAgentEvent` and `chat.store.handleAgentEvent` if `event.agentId` matches the selected session. If no session is selected (lobby screen), agent events are dropped.

## Shared Types

### New Types

```typescript
export interface SessionListItem {
  sessionId: string;
  title: string;
  directory: string;
  projectName: string;
  status: 'busy' | 'waiting' | 'stale';
  lastUpdated: number;
}
```

### Modified Types

`IPC_CHANNELS` gains: `SESSION_LIST_UPDATE: 'office:session-list-update'`

`OfficeAPI` gains: `onSessionListUpdate(callback: (sessions: SessionListItem[]) => void): () => void`

`ToolAdapter` gains: `protected emitSessionList(sessions: SessionListItem[]): void` (emits `'sessionListUpdate'` event)

`AgentEvent` and `AgentEventType` are **unchanged**.

## Edge Cases

**Session disappears while in office:** If the selected session is deleted or archived while the user is viewing it in the office, the adapter will stop including it in the session list. The `main.tsx` event router detects this (no matching events arrive, session gone from list) and calls `navigateToLobby()` automatically.

**Session with zero parts:** A newly created session may appear in the lobby with no parts yet. It renders as **stale** status (no last part to indicate activity). Entering the office shows an empty office with an idle character. This is expected behavior.

**No sessions at all:** The lobby session panel shows an empty state message. The lobby PixiJS scene is still rendered.

## File Structure

### New Files
```
src/renderer/src/screens/LobbyScreen.tsx
src/renderer/src/screens/OfficeScreen.tsx
src/renderer/src/components/SessionPanel/SessionPanel.tsx
src/renderer/src/lobby/LobbyCanvas.tsx
src/renderer/src/lobby/LobbyScene.ts
src/renderer/src/stores/app.store.ts
src/renderer/src/stores/session.store.ts
src/renderer/src/assets/lobby-layout.json
```

### Modified Files
```
shared/types.ts
electron/adapters/types.ts
electron/adapters/opencode.adapter.ts
electron/session-manager.ts
electron/main.ts
electron/preload.ts
src/renderer/src/App.tsx
src/renderer/src/main.tsx
src/renderer/src/stores/office.store.ts
src/renderer/src/stores/chat.store.ts
src/renderer/src/stores/kanban.store.ts
```

### Removed Files
```
src/renderer/src/components/SessionSelector/SessionSelector.tsx
```

## OpenCode Database Reference

Key tables used:
- `session` — `id`, `title`, `directory`, `project_id`, `parent_id`, `time_created`, `time_updated`, `time_archived`
- `part` — `id`, `session_id`, `time_updated`, `data` (JSON with `type`, `reason`, etc.)
- `project` — `id`, `worktree`, `name`

Activity signals from `part.data`:
- `{"type": "step-start"}` → agent processing
- `{"type": "step-finish", "reason": "tool-calls"}` → agent mid-turn
- `{"type": "step-finish", "reason": "stop"}` → turn complete, waiting for user
