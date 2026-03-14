# Session Creation from Lobby Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to create new OpenCode sessions directly from the lobby screen via a FAB + popover, spawning `opencode run` subprocesses and linking sessions through adapter polling.

**Architecture:** The lobby gains a FAB that opens a popover (tool selector + folder picker). On "Start," the app navigates to the Office in a pre-session state. The first prompt triggers `opencode run` as a subprocess. The adapter's existing SQLite polling discovers the new session, and the main process links it to the pending config via a `SESSION_LINKED` IPC event. Subsequent prompts use `--session <id>`.

**Tech Stack:** Electron, React, TypeScript, Zustand, Vitest

**Spec:** `docs/superpowers/specs/2026-03-14-session-creation-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/renderer/src/components/LobbyFAB/LobbyFAB.tsx` | FAB button + popover (tool selector, folder picker, start button) |
| `tests/src/stores/app.store.session-creation.test.ts` | Tests for new app store session creation actions |
| `tests/src/stores/chat.store.system-message.test.ts` | Tests for addSystemMessage action |

### Modified Files
| File | Change |
|------|--------|
| `shared/types.ts` | Add 6 IPC channels, 6 OfficeAPI methods, `createdAt` to `SessionListItem` |
| `electron/preload.ts` | Expose 6 new methods |
| `electron/main.ts` | Add 4 IPC handlers (CREATE_SESSION, PICK_DIRECTORY, CANCEL_SESSION, DISPATCH), session linking logic, subprocess management |
| `src/renderer/src/stores/app.store.ts` | Add `pendingSession`, `dispatchInFlight`, `createSession()`, `linkSession()`, `setDispatchInFlight()`, `clearDispatchInFlight()` |
| `src/renderer/src/stores/chat.store.ts` | Add `addSystemMessage()` action |
| `src/renderer/src/main.tsx` | Add listeners for `SESSION_LINKED`, `SESSION_LINK_FAILED`, `DISPATCH_ERROR` |
| `src/renderer/src/screens/LobbyScreen.tsx` | Render `<LobbyFAB />` |
| `src/renderer/src/components/TopBar/TopBar.tsx` | Show project name + pre-session indicator |
| `src/renderer/src/components/ChatPanel/PromptInput.tsx` | Disable send when `dispatchInFlight` is true |
| `src/renderer/src/components/ChatPanel/ChatPanel.tsx` | Set `dispatchInFlight` on first prompt in pre-session state |
| `electron/adapters/opencode.adapter.ts` | Add `time_created` to session list items as `createdAt` |

---

## Chunk 1: Types, Preload, and Store Foundation

### Task 1: Add IPC channels and OfficeAPI types

**Files:**
- Modify: `shared/types.ts:95-117`

- [ ] **Step 1: Add new IPC channels to `IPC_CHANNELS`**

In `shared/types.ts`, add these entries to the `IPC_CHANNELS` object (after `SESSION_LIST_UPDATE`):

```typescript
CREATE_SESSION: 'office:create-session',
PICK_DIRECTORY: 'office:pick-directory',
SESSION_LINKED: 'office:session-linked',
SESSION_LINK_FAILED: 'office:session-link-failed',
DISPATCH_ERROR: 'office:dispatch-error',
CANCEL_SESSION: 'office:cancel-session',
```

- [ ] **Step 2: Add `createdAt` to `SessionListItem`**

In `shared/types.ts`, add `createdAt` to the `SessionListItem` interface (after `status`):

```typescript
createdAt: number;
```

This is sourced from the session's `time_created` column, not `time_updated`. It enables accurate matching during session linking (matching new sessions by creation time rather than last-updated time, which can false-match existing sessions in the same directory).

- [ ] **Step 3: Add new methods to `OfficeAPI` interface**

In `shared/types.ts`, add these methods to the `OfficeAPI` interface (after `onSessionListUpdate`):

```typescript
createSession(tool: string, directory: string): Promise<{ ok: true }>;
pickDirectory(): Promise<string | null>;
onSessionLinked(callback: (data: { sessionId: string; title: string }) => void): () => void;
onSessionLinkFailed(callback: (data: { error: string }) => void): () => void;
onDispatchError(callback: (data: { error: string }) => void): () => void;
cancelSession(): Promise<void>;
```

- [ ] **Step 4: Run existing tests to verify no regressions**

Run: `npx vitest run`
Expected: All existing tests pass (types are additive, no breakage).

- [ ] **Step 5: Commit**

```bash
git add shared/types.ts
git commit -m "feat: add session creation IPC channels and OfficeAPI types"
```

---

### Task 2: Add preload bridge methods

**Files:**
- Modify: `electron/preload.ts:5-48`

- [ ] **Step 1: Add all 6 new methods to the `contextBridge.exposeInMainWorld` call**

After the existing `onSessionListUpdate` method, add:

```typescript
onSessionLinked(callback: (data: { sessionId: string; title: string }) => void): () => void {
  const handler = (_: Electron.IpcRendererEvent, data: { sessionId: string; title: string }) => callback(data);
  ipcRenderer.on(IPC_CHANNELS.SESSION_LINKED, handler);
  return () => ipcRenderer.removeListener(IPC_CHANNELS.SESSION_LINKED, handler);
},

onSessionLinkFailed(callback: (data: { error: string }) => void): () => void {
  const handler = (_: Electron.IpcRendererEvent, data: { error: string }) => callback(data);
  ipcRenderer.on(IPC_CHANNELS.SESSION_LINK_FAILED, handler);
  return () => ipcRenderer.removeListener(IPC_CHANNELS.SESSION_LINK_FAILED, handler);
},

onDispatchError(callback: (data: { error: string }) => void): () => void {
  const handler = (_: Electron.IpcRendererEvent, data: { error: string }) => callback(data);
  ipcRenderer.on(IPC_CHANNELS.DISPATCH_ERROR, handler);
  return () => ipcRenderer.removeListener(IPC_CHANNELS.DISPATCH_ERROR, handler);
},

createSession(tool: string, directory: string): Promise<{ ok: true }> {
  return ipcRenderer.invoke(IPC_CHANNELS.CREATE_SESSION, tool, directory);
},

pickDirectory(): Promise<string | null> {
  return ipcRenderer.invoke(IPC_CHANNELS.PICK_DIRECTORY);
},

cancelSession(): Promise<void> {
  return ipcRenderer.invoke(IPC_CHANNELS.CANCEL_SESSION);
},
```

- [ ] **Step 2: Run existing tests**

Run: `npx vitest run`
Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add electron/preload.ts
git commit -m "feat: add session creation preload bridge methods"
```

---

### Task 3: Add `addSystemMessage` to chat store

**Files:**
- Modify: `src/renderer/src/stores/chat.store.ts:13-24,28-73`
- Test: `tests/src/stores/chat.store.system-message.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/src/stores/chat.store.system-message.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from '../../../src/renderer/src/stores/chat.store';

describe('ChatStore.addSystemMessage', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it('adds a system message to the thread', () => {
    useChatStore.getState().addSystemMessage('Connection lost');
    const messages = useChatStore.getState().messages;
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toBe('Connection lost');
    expect(messages[0].id).toMatch(/^msg-/);
    expect(messages[0].timestamp).toBeGreaterThan(0);
  });

  it('appends system message after existing messages', () => {
    useChatStore.getState().addUserMessage('Hello');
    useChatStore.getState().addSystemMessage('Error occurred');
    const messages = useChatStore.getState().messages;
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('system');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/src/stores/chat.store.system-message.test.ts`
Expected: FAIL — `addSystemMessage` is not a function.

- [ ] **Step 3: Implement `addSystemMessage`**

In `src/renderer/src/stores/chat.store.ts`:

Add `addSystemMessage` to the `ChatState` interface:

```typescript
addSystemMessage: (content: string) => void;
```

Add the implementation in the `create` call, after `addUserMessage`:

```typescript
addSystemMessage: (content: string) => {
  set((state) => ({
    messages: [...state.messages, {
      id: `msg-${++messageCounter}`,
      role: 'system' as const,
      content,
      timestamp: Date.now(),
    }],
  }));
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/src/stores/chat.store.system-message.test.ts`
Expected: PASS.

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/stores/chat.store.ts tests/src/stores/chat.store.system-message.test.ts
git commit -m "feat: add addSystemMessage to chat store"
```

---

### Task 4: Add session creation state to app store

**Files:**
- Modify: `src/renderer/src/stores/app.store.ts:1-33`
- Test: `tests/src/stores/app.store.session-creation.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/src/stores/app.store.session-creation.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../../src/renderer/src/stores/app.store';
import { useOfficeStore } from '../../../src/renderer/src/stores/office.store';
import { useChatStore } from '../../../src/renderer/src/stores/chat.store';
import { useKanbanStore } from '../../../src/renderer/src/stores/kanban.store';

describe('AppStore session creation', () => {
  beforeEach(() => {
    useAppStore.getState().navigateToLobby();
  });

  it('starts with no pending session and dispatchInFlight false', () => {
    const state = useAppStore.getState();
    expect(state.pendingSession).toBeNull();
    expect(state.dispatchInFlight).toBe(false);
  });

  it('createSession sets pending and navigates to office', () => {
    useAppStore.getState().createSession('opencode', '/tmp/myproject');
    const state = useAppStore.getState();
    expect(state.screen).toBe('office');
    expect(state.selectedSessionId).toBeNull();
    expect(state.pendingSession).toEqual({
      tool: 'opencode',
      directory: '/tmp/myproject',
      createdAt: expect.any(Number),
    });
  });

  it('createSession resets office, chat, and kanban stores', () => {
    const officeReset = vi.spyOn(useOfficeStore.getState(), 'reset');
    const chatReset = vi.spyOn(useChatStore.getState(), 'reset');
    const kanbanReset = vi.spyOn(useKanbanStore.getState(), 'reset');
    useAppStore.getState().createSession('opencode', '/tmp/proj');
    expect(officeReset).toHaveBeenCalled();
    expect(chatReset).toHaveBeenCalled();
    expect(kanbanReset).toHaveBeenCalled();
  });

  it('linkSession clears pending and sets selected session', () => {
    useAppStore.getState().createSession('opencode', '/tmp/proj');
    useAppStore.getState().setDispatchInFlight(true);
    useAppStore.getState().linkSession('ses_abc', 'My Session');
    const state = useAppStore.getState();
    expect(state.pendingSession).toBeNull();
    expect(state.dispatchInFlight).toBe(false);
    expect(state.selectedSessionId).toBe('ses_abc');
    expect(state.selectedSessionTitle).toBe('My Session');
  });

  it('setDispatchInFlight toggles the flag', () => {
    useAppStore.getState().setDispatchInFlight(true);
    expect(useAppStore.getState().dispatchInFlight).toBe(true);
    useAppStore.getState().setDispatchInFlight(false);
    expect(useAppStore.getState().dispatchInFlight).toBe(false);
  });

  it('clearDispatchInFlight sets flag to false', () => {
    useAppStore.getState().setDispatchInFlight(true);
    useAppStore.getState().clearDispatchInFlight();
    expect(useAppStore.getState().dispatchInFlight).toBe(false);
  });

  it('navigateToLobby clears pending session and dispatchInFlight', () => {
    useAppStore.getState().createSession('opencode', '/tmp/proj');
    useAppStore.getState().setDispatchInFlight(true);
    useAppStore.getState().navigateToLobby();
    const state = useAppStore.getState();
    expect(state.pendingSession).toBeNull();
    expect(state.dispatchInFlight).toBe(false);
    expect(state.screen).toBe('lobby');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/src/stores/app.store.session-creation.test.ts`
Expected: FAIL — `createSession`, `linkSession`, `pendingSession`, etc. not found.

- [ ] **Step 3: Implement app store changes**

Replace the entire contents of `src/renderer/src/stores/app.store.ts`:

```typescript
import { create } from 'zustand';
import { useOfficeStore } from './office.store';
import { useChatStore } from './chat.store';
import { useKanbanStore } from './kanban.store';

type Screen = 'lobby' | 'office';

interface PendingSession {
  tool: string;
  directory: string;
  createdAt: number;
}

interface AppState {
  screen: Screen;
  selectedSessionId: string | null;
  selectedSessionTitle: string | null;
  pendingSession: PendingSession | null;
  dispatchInFlight: boolean;
  navigateToOffice: (sessionId: string, title: string) => void;
  navigateToLobby: () => void;
  createSession: (tool: string, directory: string) => void;
  linkSession: (sessionId: string, title: string) => void;
  setDispatchInFlight: (value: boolean) => void;
  clearDispatchInFlight: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  screen: 'lobby',
  selectedSessionId: null,
  selectedSessionTitle: null,
  pendingSession: null,
  dispatchInFlight: false,

  navigateToOffice: (sessionId, title) => {
    useOfficeStore.getState().reset();
    useChatStore.getState().reset();
    set({ screen: 'office', selectedSessionId: sessionId, selectedSessionTitle: title });
  },

  navigateToLobby: () => {
    useOfficeStore.getState().reset();
    useChatStore.getState().reset();
    useKanbanStore.getState().reset();
    set({
      screen: 'lobby',
      selectedSessionId: null,
      selectedSessionTitle: null,
      pendingSession: null,
      dispatchInFlight: false,
    });
  },

  createSession: (tool, directory) => {
    useOfficeStore.getState().reset();
    useChatStore.getState().reset();
    useKanbanStore.getState().reset();
    set({
      screen: 'office',
      selectedSessionId: null,
      selectedSessionTitle: null,
      pendingSession: { tool, directory, createdAt: Date.now() },
      dispatchInFlight: false,
    });
  },

  linkSession: (sessionId, title) => {
    set({
      pendingSession: null,
      dispatchInFlight: false,
      selectedSessionId: sessionId,
      selectedSessionTitle: title,
    });
  },

  setDispatchInFlight: (value) => set({ dispatchInFlight: value }),
  clearDispatchInFlight: () => set({ dispatchInFlight: false }),
}));
```

- [ ] **Step 4: Run new tests**

Run: `npx vitest run tests/src/stores/app.store.session-creation.test.ts`
Expected: PASS.

- [ ] **Step 5: Run ALL tests to verify no regressions**

Run: `npx vitest run`
Expected: All pass — existing `app.store.test.ts` tests should still work since `navigateToOffice` and `navigateToLobby` are unchanged in behavior.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/stores/app.store.ts tests/src/stores/app.store.session-creation.test.ts
git commit -m "feat: add session creation state to app store"
```

---

## Chunk 2: Main Process Handlers

### Task 5: Add PICK_DIRECTORY and CREATE_SESSION IPC handlers

**Files:**
- Modify: `electron/main.ts:1-8,79-108`

- [ ] **Step 1: Add imports and state variables**

At the top of `electron/main.ts`, add `dialog` to the Electron import:

```typescript
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
```

Add `spawn` and `ChildProcess` import:

```typescript
import { spawn, type ChildProcess } from 'child_process';
```

After the `let windowReady = false;` line, add session management state:

```typescript
let pendingSession: { tool: string; directory: string; createdAt: number } | null = null;
let linkedSessionId: string | null = null;
let dispatchInFlight = false;
let linkingTimer: ReturnType<typeof setTimeout> | null = null;
const activeProcesses = new Set<ChildProcess>();
```

- [ ] **Step 2: Add PICK_DIRECTORY handler in `setupIPC()`**

After the existing `GET_KANBAN` handler, add:

```typescript
ipcMain.handle(IPC_CHANNELS.PICK_DIRECTORY, async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});
```

- [ ] **Step 3: Add CREATE_SESSION handler in `setupIPC()`**

```typescript
ipcMain.handle(IPC_CHANNELS.CREATE_SESSION, async (_event, tool: string, directory: string) => {
  pendingSession = { tool, directory, createdAt: Date.now() };
  linkedSessionId = null;
  dispatchInFlight = false;
  if (linkingTimer) { clearTimeout(linkingTimer); linkingTimer = null; }
  console.log('[Main] Session created:', { tool, directory });
  return { ok: true };
});
```

- [ ] **Step 4: Add CANCEL_SESSION handler in `setupIPC()`**

```typescript
ipcMain.handle(IPC_CHANNELS.CANCEL_SESSION, async () => {
  console.log('[Main] Session cancelled');
  pendingSession = null;
  linkedSessionId = null;
  dispatchInFlight = false;
  if (linkingTimer) { clearTimeout(linkingTimer); linkingTimer = null; }
  for (const proc of activeProcesses) {
    proc.kill();
  }
  activeProcesses.clear();
});
```

- [ ] **Step 5: Run existing tests**

Run: `npx vitest run`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add electron/main.ts
git commit -m "feat: add PICK_DIRECTORY, CREATE_SESSION, CANCEL_SESSION IPC handlers"
```

---

### Task 6: Wire up DISPATCH handler with subprocess spawning

**Files:**
- Modify: `electron/main.ts` (the existing DISPATCH handler at line 80-84)

- [ ] **Step 1: Replace the DISPATCH TODO stub**

Replace the existing `ipcMain.handle(IPC_CHANNELS.DISPATCH, ...)` with:

```typescript
ipcMain.handle(IPC_CHANNELS.DISPATCH, async (_event, prompt: string) => {
  if (linkedSessionId && pendingSession) {
    const args = ['run', prompt, '--session', linkedSessionId, '--dir', pendingSession.directory, '--format', 'json'];
    spawnOpenCode(args);
    return { sessionId: linkedSessionId };
  }

  if (pendingSession && !dispatchInFlight) {
    dispatchInFlight = true;
    const args = ['run', prompt, '--dir', pendingSession.directory, '--format', 'json'];
    spawnOpenCode(args);

    // Start 30s linking timeout
    linkingTimer = setTimeout(() => {
      if (!linkedSessionId && mainWindow) {
        mainWindow.webContents.send(IPC_CHANNELS.SESSION_LINK_FAILED, {
          error: 'Timed out waiting for session to appear',
        });
        dispatchInFlight = false;
      }
    }, 30_000);

    return { sessionId: 'pending' };
  }

  if (pendingSession && dispatchInFlight) {
    return { error: 'session-starting' };
  }

  return { error: 'no-session' };
});
```

- [ ] **Step 2: Add `spawnOpenCode` helper function**

Add this function before `setupIPC()`:

```typescript
function spawnOpenCode(args: string[]): void {
  console.log('[Main] Spawning: opencode', args.join(' '));
  const child = spawn('opencode', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  activeProcesses.add(child);

  child.stdout?.on('data', (data: Buffer) => {
    console.log('[OpenCode stdout]', data.toString().trim());
  });

  child.stderr?.on('data', (data: Buffer) => {
    console.error('[OpenCode stderr]', data.toString().trim());
  });

  child.on('error', (err) => {
    console.error('[Main] opencode spawn error:', err.message);
    activeProcesses.delete(child);
    dispatchInFlight = false;
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.DISPATCH_ERROR, {
        error: err.message,
      });
    }
  });

  child.on('exit', (code) => {
    activeProcesses.delete(child);
    if (code !== 0 && code !== null) {
      console.error('[Main] opencode exited with code:', code);
      dispatchInFlight = false;
      if (mainWindow) {
        mainWindow.webContents.send(IPC_CHANNELS.DISPATCH_ERROR, {
          error: `opencode exited with code ${code}`,
        });
      }
    }
  });
}
```

- [ ] **Step 3: Clean up processes on app quit**

In the existing `app.on('window-all-closed', ...)` handler, add cleanup before `app.quit()`:

```typescript
app.on('window-all-closed', () => {
  for (const proc of activeProcesses) {
    proc.kill();
  }
  activeProcesses.clear();
  if (linkingTimer) clearTimeout(linkingTimer);
  sessionManager?.stop();
  app.quit();
});
```

- [ ] **Step 4: Run existing tests**

Run: `npx vitest run`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add electron/main.ts
git commit -m "feat: wire DISPATCH to spawn opencode run subprocess"
```

---

### Task 7: Add session linking logic

**Files:**
- Modify: `electron/main.ts` (in `setupAdapters()`)

- [ ] **Step 1: Add `path` import if not already present**

The file already imports `path` — verify it's there.

- [ ] **Step 2: Replace the existing `sessionListUpdate` listener with linking logic**

Replace the existing `sessionManager.on('sessionListUpdate', ...)` block (lines 60-64 of `electron/main.ts`) with this version that adds session linking:

```typescript
sessionManager.on('sessionListUpdate', (sessions: SessionListItem[]) => {
  if (mainWindow && windowReady) {
    mainWindow.webContents.send(IPC_CHANNELS.SESSION_LIST_UPDATE, sessions);
  }

  // Session linking: match new session to pending config
  if (pendingSession && !linkedSessionId && dispatchInFlight) {
    const match = sessions.find(s =>
      s.directory === pendingSession!.directory &&
      s.createdAt > pendingSession!.createdAt - 2000
    );
    if (match) {
      linkedSessionId = match.sessionId;
      dispatchInFlight = false;
      if (linkingTimer) { clearTimeout(linkingTimer); linkingTimer = null; }
      console.log('[Main] Session linked:', match.sessionId, match.title);
      if (mainWindow) {
        mainWindow.webContents.send(IPC_CHANNELS.SESSION_LINKED, {
          sessionId: match.sessionId,
          title: match.title,
        });
      }
    }
  }
});
```

The matching uses `s.createdAt` (session creation time) rather than `s.lastUpdated`, preventing false matches against existing sessions in the same directory that happen to get updated.

- [ ] **Step 3: Run existing tests**

Run: `npx vitest run`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add electron/main.ts
git commit -m "feat: add session linking logic in main process"
```

---

### Task 7b: Add `createdAt` to OpenCode adapter session list output

**Files:**
- Modify: `electron/adapters/opencode.adapter.ts:89-107`

- [ ] **Step 1: Add `time_created` to the SQL query and `SessionRow` interface**

In `opencode.adapter.ts`, the `SessionRow` interface (line 22) already has `time_created`. The SQL query at line 90 already selects `time_created`. Verify this.

- [ ] **Step 2: Include `createdAt` in the session list mapping**

In the `poll()` method, update the `sessionList` mapping (around line 100) to include `createdAt`:

```typescript
const sessionList: SessionListItem[] = sessionRows.map(session => ({
  sessionId: session.id,
  title: session.title,
  directory: session.directory,
  projectName: path.basename(session.directory) || session.directory,
  status: this.getSessionStatus(session.id, session.time_updated),
  lastUpdated: session.time_updated,
  createdAt: session.time_created,
}));
```

- [ ] **Step 3: Run existing tests**

Run: `npx vitest run`
Expected: All pass (the adapter tests should work since `createdAt` is additive).

- [ ] **Step 4: Commit**

```bash
git add electron/adapters/opencode.adapter.ts
git commit -m "feat: include createdAt in session list for linking accuracy"
```

---

## Chunk 3: Renderer Wiring and UI

### Task 8: Add renderer event listeners

**Files:**
- Modify: `src/renderer/src/main.tsx:10-42`

- [ ] **Step 1: Add session lifecycle event listeners**

In `initStoreSubscriptions()`, after the existing `onKanbanUpdate` listener, add:

```typescript
if (window.office.onSessionLinked) {
  window.office.onSessionLinked(({ sessionId, title }) => {
    useAppStore.getState().linkSession(sessionId, title);
  });
}

if (window.office.onSessionLinkFailed) {
  window.office.onSessionLinkFailed(({ error }) => {
    useChatStore.getState().addSystemMessage(`Failed to start session: ${error}`);
    useAppStore.getState().clearDispatchInFlight();
  });
}

if (window.office.onDispatchError) {
  window.office.onDispatchError(({ error }) => {
    useChatStore.getState().addSystemMessage(`Error: ${error}`);
    useAppStore.getState().clearDispatchInFlight();
  });
}
```

- [ ] **Step 2: Run existing tests**

Run: `npx vitest run`
Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/main.tsx
git commit -m "feat: add session lifecycle event listeners in renderer"
```

---

### Task 9: Update PromptInput to respect `dispatchInFlight`

**Files:**
- Modify: `src/renderer/src/components/ChatPanel/PromptInput.tsx:1-12,16,55,71-78`

- [ ] **Step 1: Add app store import and read `dispatchInFlight`**

Add import at top:

```typescript
import { useAppStore } from '../../stores/app.store';
```

Inside the component, after `const isDispatching = ...`:

```typescript
const dispatchInFlight = useAppStore((s) => s.dispatchInFlight);
```

- [ ] **Step 2: Update the disabled logic**

Change the `handleSubmit` guard:

```typescript
const isBlocked = isDispatching || dispatchInFlight;
```

Replace `if (!trimmed || isDispatching) return;` with:

```typescript
if (!trimmed || isBlocked) return;
```

Update the textarea `disabled` prop:

```typescript
disabled={isBlocked}
```

Update the button `disabled` prop:

```typescript
disabled={isBlocked || !input.trim()}
```

Update the button style to use `isBlocked`:

```typescript
background: isBlocked ? '#2a2a4a' : '#3b82f6',
cursor: isBlocked ? 'not-allowed' : 'pointer',
```

- [ ] **Step 3: Run existing tests**

Run: `npx vitest run`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/ChatPanel/PromptInput.tsx
git commit -m "feat: disable prompt input when dispatch in flight"
```

---

### Task 10: Update TopBar for pre-session state

**Files:**
- Modify: `src/renderer/src/components/TopBar/TopBar.tsx:6-11,65-67`

- [ ] **Step 1: Read pending session from app store**

Add after the existing `navigateToLobby` line:

```typescript
const pendingSession = useAppStore((s) => s.pendingSession);
```

- [ ] **Step 2: Compute display title for pre-session state**

Replace the session title rendering (lines 65-67) with:

```typescript
{sessionTitle ? (
  <span style={{ color: '#e5e5e5', fontWeight: 500 }}>{sessionTitle}</span>
) : pendingSession ? (
  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <span style={{ color: '#e5e5e5', fontWeight: 500 }}>
      {pendingSession.directory.split('/').pop() || pendingSession.directory}
    </span>
    <span style={{ color: '#6b7280', fontSize: 10 }}>waiting for first prompt</span>
  </span>
) : null}
```

- [ ] **Step 3: Update back button to call cancelSession**

Replace the `handleBack` function:

```typescript
const handleBack = () => {
  if (window.office?.cancelSession) {
    window.office.cancelSession();
  }
  navigateToLobby();
};
```

- [ ] **Step 4: Run existing tests**

Run: `npx vitest run`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/TopBar/TopBar.tsx
git commit -m "feat: show pre-session state in TopBar with cancel support"
```

---

### Task 11: Update ChatPanel to set `dispatchInFlight` on first prompt

**Files:**
- Modify: `src/renderer/src/components/ChatPanel/ChatPanel.tsx:1-2,17-28`

- [ ] **Step 1: Import app store**

Add at top:

```typescript
import { useAppStore } from '../../stores/app.store';
```

- [ ] **Step 2: Update handleSubmit to set dispatchInFlight for pre-session state**

Replace the `handleSubmit` function:

```typescript
const handleSubmit = async (prompt: string) => {
  addUserMessage(prompt);

  const appState = useAppStore.getState();
  if (appState.pendingSession && !appState.selectedSessionId) {
    appState.setDispatchInFlight(true);
  }

  if ((window as any).office?.dispatch) {
    useChatStore.getState().setDispatching(true);
    try {
      await (window as any).office.dispatch(prompt);
    } finally {
      useChatStore.getState().setDispatching(false);
    }
  }
};
```

- [ ] **Step 3: Run existing tests**

Run: `npx vitest run`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/ChatPanel/ChatPanel.tsx
git commit -m "feat: set dispatchInFlight on first prompt in pre-session state"
```

---

### Task 12: Create LobbyFAB component

**Files:**
- Create: `src/renderer/src/components/LobbyFAB/LobbyFAB.tsx`
- Modify: `src/renderer/src/screens/LobbyScreen.tsx`

- [ ] **Step 1: Create the LobbyFAB component**

Create `src/renderer/src/components/LobbyFAB/LobbyFAB.tsx`:

```typescript
import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../stores/app.store';

type Tool = 'opencode' | 'claude-code';

const TOOLS: { id: Tool; label: string; enabled: boolean }[] = [
  { id: 'opencode', label: 'OpenCode', enabled: true },
  { id: 'claude-code', label: 'Claude Code', enabled: false },
];

export function LobbyFAB() {
  const [open, setOpen] = useState(false);
  const [selectedTool, setSelectedTool] = useState<Tool>('opencode');
  const [selectedDir, setSelectedDir] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const createSession = useAppStore((s) => s.createSession);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('keydown', handleKey);
      document.addEventListener('mousedown', handleClick);
    }
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [open]);

  const handlePickDir = async () => {
    if (!window.office?.pickDirectory) return;
    const dir = await window.office.pickDirectory();
    if (dir) setSelectedDir(dir);
  };

  const handleStart = async () => {
    if (!selectedDir) return;
    if (window.office?.createSession) {
      await window.office.createSession(selectedTool, selectedDir);
    }
    createSession(selectedTool, selectedDir);
    setOpen(false);
    setSelectedDir(null);
  };

  const truncatedDir = selectedDir
    ? selectedDir.split('/').pop() || selectedDir
    : null;

  return (
    <div ref={popoverRef} style={{ position: 'absolute', bottom: 24, right: 24, zIndex: 20 }}>
      {open && (
        <div style={{
          position: 'absolute',
          bottom: 56,
          right: 0,
          background: 'rgba(15, 15, 26, 0.95)',
          border: '1px solid #2a2a4a',
          borderRadius: 8,
          padding: 12,
          minWidth: 220,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Tool
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {TOOLS.map((tool) => (
              <button
                key={tool.id}
                onClick={() => tool.enabled && setSelectedTool(tool.id)}
                disabled={!tool.enabled}
                title={!tool.enabled ? 'Coming soon' : undefined}
                style={{
                  padding: '4px 10px',
                  borderRadius: 4,
                  border: selectedTool === tool.id ? '1px solid #3b82f6' : '1px solid #2a2a4a',
                  background: selectedTool === tool.id ? 'rgba(59, 130, 246, 0.15)' : 'rgba(42, 42, 74, 0.3)',
                  color: !tool.enabled ? '#4a4a6a' : selectedTool === tool.id ? '#3b82f6' : '#9ca3af',
                  fontSize: 11,
                  cursor: tool.enabled ? 'pointer' : 'not-allowed',
                }}
              >
                {tool.label}
              </button>
            ))}
          </div>

          <button
            onClick={handlePickDir}
            style={{
              padding: '6px 10px',
              borderRadius: 4,
              border: '1px solid #2a2a4a',
              background: 'rgba(42, 42, 74, 0.3)',
              color: selectedDir ? '#e5e5e5' : '#9ca3af',
              fontSize: 11,
              cursor: 'pointer',
              textAlign: 'left',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {truncatedDir || 'Choose Folder...'}
          </button>

          <button
            onClick={handleStart}
            disabled={!selectedDir}
            style={{
              padding: '6px 12px',
              borderRadius: 4,
              border: 'none',
              background: selectedDir ? '#3b82f6' : '#2a2a4a',
              color: selectedDir ? '#fff' : '#6b7280',
              fontSize: 12,
              fontWeight: 500,
              cursor: selectedDir ? 'pointer' : 'not-allowed',
            }}
          >
            Start
          </button>
        </div>
      )}

      <button
        onClick={() => setOpen(!open)}
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          border: 'none',
          background: '#3b82f6',
          color: '#fff',
          fontSize: 24,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)',
        }}
      >
        +
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Add LobbyFAB to LobbyScreen**

In `src/renderer/src/screens/LobbyScreen.tsx`, add the import and render:

```typescript
import React from 'react';
import { SessionPanel } from '../components/SessionPanel/SessionPanel';
import { LobbyCanvas } from '../lobby/LobbyCanvas';
import { LobbyFAB } from '../components/LobbyFAB/LobbyFAB';

export function LobbyScreen() {
  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0f0f1a', color: '#e5e5e5', position: 'relative' }}>
      <SessionPanel />
      <LobbyCanvas />
      <LobbyFAB />
    </div>
  );
}
```

Note: `position: 'relative'` added to the container so the FAB's `position: 'absolute'` is relative to the lobby screen.

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/LobbyFAB/LobbyFAB.tsx src/renderer/src/screens/LobbyScreen.tsx
git commit -m "feat: add LobbyFAB with tool selector and folder picker"
```

---

## Chunk 4: Integration Verification

### Task 13: Run full test suite and verify

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 2: Build the project**

Run: `npx electron-vite build`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 3: Verify type consistency**

Check that `shared/types.ts` OfficeAPI interface matches what `electron/preload.ts` actually exposes. Every method in the interface should have a corresponding implementation in preload.

- [ ] **Step 4: Commit any fixes if needed**

If type errors or build issues were found, fix and commit the specific files that were changed:

```bash
git add <specific files that were fixed>
git commit -m "fix: resolve build/type issues from session creation integration"
```
