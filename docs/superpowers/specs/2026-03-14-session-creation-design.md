# Session Creation from Lobby Design

## Overview

Add the ability to create new OpenCode sessions directly from the lobby screen. A floating action button (FAB) on the lobby canvas opens a popover where the user selects a tool (OpenCode for v1, others coming later) and picks a working directory via the native OS folder picker. The app navigates to the Office screen, where the user types the initial prompt in the Chat Panel. The OpenCode session is spawned on first prompt via `opencode run`.

## Architecture

### Session Creation Flow

1. **Lobby**: User clicks FAB (bottom-right of lobby canvas area) -> popover appears
2. **Popover**: User selects tool (OpenCode), clicks "Choose Folder...", picks a directory via native OS dialog
3. **Start**: User clicks "Start" -> app stores a pending session config, navigates to Office
4. **Office (pre-session)**: Office screen renders with characters idle, Chat Panel ready for input. TopBar shows project name and a "waiting for first prompt" indicator. No OpenCode session exists yet.
5. **First prompt**: User types in Chat Panel -> main process spawns `opencode run "<prompt>" --dir <directory> --format json`
6. **Session discovery**: Adapter's existing SQLite polling picks up the new session, emits `agent:created` + tool events. Main process matches the new session to the pending config by directory + recency, sends `SESSION_LINKED` event to renderer.
7. **Subsequent prompts**: Main process spawns `opencode run "<prompt>" --session <id> --dir <directory> --format json` for each follow-up message.

### Subprocess Strategy

Each prompt dispatched to OpenCode spawns a separate `opencode run` invocation:

- First message: `opencode run "<prompt>" --dir <directory> --format json`
- Follow-ups: `opencode run "<prompt>" --session <id> --dir <directory> --format json`

The subprocess runs to completion. Its stdout (JSON events) is logged but not used for state observation — the adapter's SQLite polling remains the single source of truth. This keeps the observation path (adapter) decoupled from the command path (subprocess spawning).

**Subprocess lifecycle:** If the user navigates back to the lobby while a subprocess is running, the subprocess is killed (`child.kill()`). On app quit, all running subprocesses are cleaned up. The main process tracks active child processes in a `Set<ChildProcess>` and removes them on exit or completion.

**Binary resolution:** `opencode` is assumed to be on `PATH`, consistent with the existing adapter's use of `execFileSync('sqlite3', ...)`.

### Session Linking

Between clicking "Start" and the adapter discovering the new session, the app is in a "pre-session" state. The main process resolves this by:

1. Storing the pending directory when `CREATE_SESSION` is received
2. After a `DISPATCH` spawns `opencode run`, watching for the next new session from the adapter's polling that matches the pending directory
3. Once matched, sending a `SESSION_LINKED` event to the renderer with the real session ID
4. Clearing the pending state

Matching criteria: session's `directory` matches the pending directory, and the session's `time_created` is after the pending config was created (with a 2-second tolerance to account for clock precision differences between `Date.now()` and OpenCode's SQLite timestamps). The first match wins.

**Linking timeout:** If no matching session is discovered within 30 seconds of the first dispatch, the main process sends a `SESSION_LINK_FAILED` event to the renderer. The Chat Panel shows an error message ("Failed to start session — try again or go back to lobby"). The user can retry by sending another prompt or navigate back.

## Lobby UI

### FAB (Floating Action Button)

- Positioned bottom-right of the lobby canvas area (React overlay, not PixiJS)
- Circular "+" button, dark theme styling consistent with the app
- Clicking opens the popover; clicking again or pressing Escape closes it

### Popover

Compact panel that appears above/beside the FAB:

- **Tool selector**: Row of chips/buttons. "OpenCode" is active and clickable. "Claude Code" is grayed out with a "coming soon" tooltip. Only one tool selected at a time.
- **"Choose Folder..." button**: Opens native OS folder dialog (`dialog.showOpenDialog` with `properties: ['openDirectory']`). After selection, shows the truncated folder path as a label.
- **"Start" button**: Enabled only after a folder is selected. Triggers `createSession(tool, directory)` and navigates to Office.

Clicking outside the popover or pressing Escape closes it without action.

## IPC Changes

### New Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `CREATE_SESSION` (`office:create-session`) | renderer -> main | Store pending session config `{ tool, directory }` |
| `PICK_DIRECTORY` (`office:pick-directory`) | renderer -> main | Open native folder dialog, return selected path or null |
| `SESSION_LINKED` (`office:session-linked`) | main -> renderer | Notify renderer that pending session matched a real session ID |
| `SESSION_LINK_FAILED` (`office:session-link-failed`) | main -> renderer | Notify renderer that session linking timed out (30s) |
| `DISPATCH_ERROR` (`office:dispatch-error`) | main -> renderer | Notify renderer that `opencode run` subprocess failed |
| `CANCEL_SESSION` (`office:cancel-session`) | renderer -> main | Clear pending state, kill subprocess, stop linking logic |

### Modified Channels

| Channel | Change |
|---------|--------|
| `DISPATCH` | Wired up to spawn `opencode run`. Uses pending directory for first prompt, `--session <id>` for subsequent prompts. |

### New Preload Methods

```typescript
// Added to OfficeAPI
createSession(tool: string, directory: string): Promise<{ ok: true }>;
pickDirectory(): Promise<string | null>;
onSessionLinked(callback: (data: { sessionId: string; title: string }) => void): () => void;
onSessionLinkFailed(callback: (data: { error: string }) => void): () => void;
onDispatchError(callback: (data: { error: string }) => void): () => void;
cancelSession(): Promise<void>;
```

`pickDirectory()` calls `dialog.showOpenDialog` in the main process and returns the selected path. This keeps Electron's `dialog` module in the main process where it belongs.

## Store Changes

### App Store (`app.store.ts`)

New state:

```typescript
pendingSession: { tool: string; directory: string; createdAt: number } | null;
dispatchInFlight: boolean;
```

New actions:

- `createSession(tool, directory)` — sets `pendingSession`, resets office/chat/kanban stores, navigates to office screen. No `selectedSessionId` yet.
- `linkSession(sessionId, title)` — called when `SESSION_LINKED` arrives. Clears `pendingSession`, clears `dispatchInFlight`, sets `selectedSessionId` and `selectedSessionTitle`.
- `setDispatchInFlight(value)` — set to true after first prompt dispatch in pre-session state.
- `clearDispatchInFlight()` — called on error events to re-enable the send button.

Modified behavior:

- `navigateToOffice(sessionId, title)` — unchanged, still used when clicking existing session cards in the lobby.
- The Office screen checks both `selectedSessionId` and `pendingSession` to determine what to show.

### Other Stores

No changes to `office.store`, `chat.store`, `kanban.store`, or `session.store`. They continue working as-is once events flow through the adapter.

## Main Process Changes (`main.ts`)

### CREATE_SESSION Handler

```
ipcMain.handle(CREATE_SESSION):
  - Store pending = { tool, directory, createdAt: Date.now() }
  - Return { ok: true }
```

### PICK_DIRECTORY Handler

```
ipcMain.handle(PICK_DIRECTORY):
  - Call dialog.showOpenDialog({ properties: ['openDirectory'] })
  - Return selected path or null if cancelled
```

### DISPATCH Handler (replaces TODO stub)

**Constraint:** Only one session is active at a time. The main process tracks the current session context via its own state: either a `pendingSession` (directory known, no session ID yet) or a `linkedSessionId` (fully resolved). The renderer's `dispatch(prompt)` call does not need to pass a session ID — the main process resolves it from its own state.

The existing `dispatch(prompt: string, agentRole?: AgentRole)` signature is unchanged. The `agentRole` parameter is ignored for OpenCode sessions (OpenCode does not have a role concept). It is preserved in the signature for future Claude Code SDK integration.

```
ipcMain.handle(DISPATCH):
  - If linkedSessionId exists:
    Spawn: opencode run "<prompt>" --session <id> --dir <directory> --format json
  - Else if pending session exists AND no dispatch is already in flight:
    Set dispatchInFlight = true
    Spawn: opencode run "<prompt>" --dir <directory> --format json
    On subprocess exit: set dispatchInFlight = false
  - Else if pending session exists AND dispatch is already in flight:
    Return error { error: 'session-starting' } — renderer should disable send until linked
  - Else:
    Return error { error: 'no-session' }
  - Track subprocess in activeProcesses set for cleanup
  - Return { sessionId: linkedId ?? 'pending' }
```

**Send button state:** The Chat Panel disables the send button after the first prompt is dispatched in pre-session state (while `dispatchInFlight` is true). It re-enables once `SESSION_LINKED` arrives. This avoids the need for a prompt queue.

### Session Linking Logic

Listen on `sessionManager.on('agentEvent')` for `agent:created` events. When one arrives:
- Check if there's a pending session whose directory matches `event` source session's directory (obtained from the adapter's session list)
- If matched: store the link, send `SESSION_LINKED` to renderer, clear pending

## Renderer Changes (`main.tsx`)

Add listeners for session lifecycle events:

```typescript
window.office.onSessionLinked(({ sessionId, title }) => {
  useAppStore.getState().linkSession(sessionId, title);
});

window.office.onSessionLinkFailed(({ error }) => {
  useChatStore.getState().addSystemMessage(`Failed to start session: ${error}`);
  useAppStore.getState().clearDispatchInFlight();
});

window.office.onDispatchError(({ error }) => {
  useChatStore.getState().addSystemMessage(`Error: ${error}`);
  useAppStore.getState().clearDispatchInFlight();
});
```

## TopBar Changes

When `pendingSession` exists but `selectedSessionId` is null:
- Show project name derived from `path.basename(pendingSession.directory)`
- Show a subtle "waiting for first prompt" or similar indicator
- Back button still works (navigates to lobby, clears pending)

## File Changes

### New Files

| File | Purpose |
|------|---------|
| `src/renderer/src/components/LobbyFAB/LobbyFAB.tsx` | FAB + popover component |

### Modified Files

| File | Change |
|------|--------|
| `shared/types.ts` | Add `CREATE_SESSION`, `PICK_DIRECTORY`, `SESSION_LINKED`, `SESSION_LINK_FAILED`, `DISPATCH_ERROR` IPC channels. Add `createSession`, `pickDirectory`, `onSessionLinked`, `onSessionLinkFailed`, `onDispatchError` to `OfficeAPI`. |
| `electron/main.ts` | Handle `CREATE_SESSION`, `PICK_DIRECTORY` IPC. Wire `DISPATCH` to spawn `opencode run`. Session linking logic. |
| `electron/preload.ts` | Expose `createSession()`, `pickDirectory()`, `onSessionLinked()`, `onSessionLinkFailed()`, `onDispatchError()`. |
| `src/renderer/src/stores/app.store.ts` | Add `pendingSession`, `createSession()`, `linkSession()`. |
| `src/renderer/src/screens/LobbyScreen.tsx` | Render `<LobbyFAB />`. |
| `src/renderer/src/main.tsx` | Listen for `SESSION_LINKED`, `SESSION_LINK_FAILED`, `DISPATCH_ERROR` events. |
| `src/renderer/src/components/TopBar/TopBar.tsx` | Show project name + waiting indicator in pre-session state. |
| `src/renderer/src/stores/chat.store.ts` | Add `addSystemMessage(text)` action for displaying errors from `DISPATCH_ERROR` and `SESSION_LINK_FAILED`. |

### Unchanged

- `OpenCodeAdapter` — stays read-only, no changes
- `SessionManager` — no new responsibilities
- `ChatPanel` — dispatch call already exists. `PromptInput` disables send button when `dispatchInFlight` is true (read from app store) and re-enables on `SESSION_LINKED`. The existing `isDispatching` flag in chat.store handles regular dispatch-in-progress; `dispatchInFlight` in app.store handles the pre-session state. Both should disable send.
- `OfficeCanvas`, `OfficeScene`, character system — work as-is once events flow
- `SessionPanel` — untouched
- `session.store`, `office.store`, `kanban.store` — no modifications

## Edge Cases

**User cancels folder picker**: `pickDirectory()` returns null, popover stays open, no action taken.

**User navigates back to lobby before sending first prompt**: `navigateToLobby()` clears `pendingSession` in the renderer store and sends a `CANCEL_SESSION` IPC to the main process, which clears its pending state, kills any running subprocess, and stops the linking logic. This prevents stale matches if `opencode run` already wrote to SQLite before the kill signal.

**`opencode run` fails**: The subprocess exits with a non-zero code or stderr output. The main process sends a `DISPATCH_ERROR` event to the renderer with the error message. The Chat Panel displays the error as a system message (e.g., "Failed to start session: <error>"). The send button is re-enabled so the user can retry with another prompt, or they can navigate back to the lobby. The `dispatchInFlight` flag is cleared.

**Directory has no `.opencode/` project**: OpenCode initializes it automatically on first `opencode run`. No special handling needed.

**Two rapid prompts before linking**: The send button is disabled after the first prompt in pre-session state until `SESSION_LINKED` arrives. This prevents the need for a prompt queue. The user sees their first prompt was sent and waits for the session to initialize.

**Session linking race**: The adapter polls every 1 second. After `opencode run` creates a session, the next poll cycle discovers it. Linking typically happens within 1-2 seconds of the first prompt being sent.
