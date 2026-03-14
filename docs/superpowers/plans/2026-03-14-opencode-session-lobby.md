# OpenCode Session Lobby Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a two-screen architecture (Building Lobby + Office) where users select OpenCode sessions from a lobby before entering the office view.

**Architecture:** App.tsx switches between LobbyScreen and OfficeScreen based on Zustand `app.store`. The OpenCode adapter polls all top-level sessions across all projects, emits a session list through a dedicated IPC channel, and continues emitting per-session agent events. Event filtering happens at the renderer level.

**Tech Stack:** Electron, React, TypeScript, PixiJS 8, Zustand, sql.js, Vitest

**Spec:** `docs/superpowers/specs/2026-03-14-opencode-session-lobby-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/renderer/src/stores/app.store.ts` | Screen navigation state (lobby/office), selected session |
| `src/renderer/src/stores/session.store.ts` | Session list from adapter |
| `src/renderer/src/screens/LobbyScreen.tsx` | Lobby layout: SessionPanel + LobbyCanvas |
| `src/renderer/src/screens/OfficeScreen.tsx` | Office layout: TopBar + ChatPanel + OfficeCanvas + StatsOverlay |
| `src/renderer/src/components/SessionPanel/SessionPanel.tsx` | Session list side panel for lobby |
| `src/renderer/src/lobby/LobbyCanvas.tsx` | PixiJS Application wrapper for lobby scene |
| `src/renderer/src/lobby/LobbyScene.ts` | Lobby tilemap, reception desk, concierge |
| `src/renderer/src/assets/lobby-layout.json` | Lobby tilemap data |
| `tests/src/stores/app.store.test.ts` | Tests for app store |
| `tests/src/stores/session.store.test.ts` | Tests for session store |
| `tests/electron/adapters/opencode.adapter.session-list.test.ts` | Tests for session list + activity detection |

### Modified Files
| File | Changes |
|------|---------|
| `shared/types.ts` | Add `SessionListItem`, `IPC_CHANNELS.SESSION_LIST_UPDATE`, `OfficeAPI.onSessionListUpdate` |
| `electron/adapters/types.ts` | Add `emitSessionList()` to `ToolAdapter` |
| `electron/adapters/opencode.adapter.ts` | Remove directory filter, add session list emission, activity detection, parameterized queries |
| `electron/session-manager.ts` | Forward `sessionListUpdate` events |
| `electron/main.ts` | Forward session list to renderer via IPC |
| `electron/preload.ts` | Expose `onSessionListUpdate` |
| `src/renderer/src/App.tsx` | Switch between LobbyScreen / OfficeScreen |
| `src/renderer/src/main.tsx` | Route session list events + filter agent events by selected session |
| `src/renderer/src/stores/office.store.ts` | Remove `focusedSessionId`, keep reset |
| `src/renderer/src/components/TopBar/TopBar.tsx` | Add "Back to Lobby" button |

### Removed Files
| File | Reason |
|------|--------|
| `src/renderer/src/components/SessionSelector/SessionSelector.tsx` | Replaced by SessionPanel in lobby |

---

## Chunk 1: Types, Stores & Adapter Foundation

### Task 1: Add shared types

**Files:**
- Modify: `shared/types.ts`

- [ ] **Step 1: Add `SessionListItem` interface**

Add after the existing `SessionInfo` interface (~line 84):

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

- [ ] **Step 2: Add IPC channel**

Add to `IPC_CHANNELS` object (~line 94):

```typescript
SESSION_LIST_UPDATE: 'office:session-list-update',
```

- [ ] **Step 3: Add `onSessionListUpdate` to `OfficeAPI`**

Add to the `OfficeAPI` interface (~line 105):

```typescript
onSessionListUpdate(callback: (sessions: SessionListItem[]) => void): () => void;
```

- [ ] **Step 4: Commit**

```bash
git add shared/types.ts
git commit -m "feat: add SessionListItem type and session list IPC channel"
```

---

### Task 2: Create app store

**Files:**
- Create: `src/renderer/src/stores/app.store.ts`
- Create: `tests/src/stores/app.store.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/src/stores/app.store.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../../src/renderer/src/stores/app.store';
import { useOfficeStore } from '../../../src/renderer/src/stores/office.store';
import { useChatStore } from '../../../src/renderer/src/stores/chat.store';
import { useKanbanStore } from '../../../src/renderer/src/stores/kanban.store';

describe('AppStore', () => {
  beforeEach(() => {
    useAppStore.getState().navigateToLobby();
  });

  it('starts on lobby screen', () => {
    expect(useAppStore.getState().screen).toBe('lobby');
    expect(useAppStore.getState().selectedSessionId).toBeNull();
  });

  it('navigates to office with session info', () => {
    useAppStore.getState().navigateToOffice('ses_123', 'Test session');
    const state = useAppStore.getState();
    expect(state.screen).toBe('office');
    expect(state.selectedSessionId).toBe('ses_123');
    expect(state.selectedSessionTitle).toBe('Test session');
  });

  it('navigates back to lobby and clears selection', () => {
    useAppStore.getState().navigateToOffice('ses_123', 'Test');
    useAppStore.getState().navigateToLobby();
    const state = useAppStore.getState();
    expect(state.screen).toBe('lobby');
    expect(state.selectedSessionId).toBeNull();
    expect(state.selectedSessionTitle).toBeNull();
  });

  it('resets office and chat stores when navigating to office', () => {
    const officeReset = vi.spyOn(useOfficeStore.getState(), 'reset');
    const chatReset = vi.spyOn(useChatStore.getState(), 'reset');
    useAppStore.getState().navigateToOffice('ses_123', 'Test');
    expect(officeReset).toHaveBeenCalled();
    expect(chatReset).toHaveBeenCalled();
  });

  it('resets all stores when navigating to lobby', () => {
    const officeReset = vi.spyOn(useOfficeStore.getState(), 'reset');
    const chatReset = vi.spyOn(useChatStore.getState(), 'reset');
    const kanbanReset = vi.spyOn(useKanbanStore.getState(), 'reset');
    useAppStore.getState().navigateToOffice('ses_123', 'Test');
    useAppStore.getState().navigateToLobby();
    expect(officeReset).toHaveBeenCalled();
    expect(chatReset).toHaveBeenCalled();
    expect(kanbanReset).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/src/stores/app.store.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement app store**

Create `src/renderer/src/stores/app.store.ts`:

```typescript
import { create } from 'zustand';
import { useOfficeStore } from './office.store';
import { useChatStore } from './chat.store';
import { useKanbanStore } from './kanban.store';

type Screen = 'lobby' | 'office';

interface AppState {
  screen: Screen;
  selectedSessionId: string | null;
  selectedSessionTitle: string | null;
  navigateToOffice: (sessionId: string, title: string) => void;
  navigateToLobby: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  screen: 'lobby',
  selectedSessionId: null,
  selectedSessionTitle: null,

  navigateToOffice: (sessionId, title) => {
    useOfficeStore.getState().reset();
    useChatStore.getState().reset();
    set({ screen: 'office', selectedSessionId: sessionId, selectedSessionTitle: title });
  },

  navigateToLobby: () => {
    useOfficeStore.getState().reset();
    useChatStore.getState().reset();
    useKanbanStore.getState().reset();
    set({ screen: 'lobby', selectedSessionId: null, selectedSessionTitle: null });
  },
}));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/src/stores/app.store.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/stores/app.store.ts tests/src/stores/app.store.test.ts
git commit -m "feat: add app store for screen navigation"
```

---

### Task 3: Create session store

**Files:**
- Create: `src/renderer/src/stores/session.store.ts`
- Create: `tests/src/stores/session.store.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/src/stores/session.store.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useSessionStore } from '../../../src/renderer/src/stores/session.store';
import type { SessionListItem } from '../../../shared/types';

const mockSessions: SessionListItem[] = [
  {
    sessionId: 'ses_1',
    title: 'Building the-office app',
    directory: '/Users/dev/the-office',
    projectName: 'the-office',
    status: 'busy',
    lastUpdated: Date.now(),
  },
  {
    sessionId: 'ses_2',
    title: 'Meshek brainstorm',
    directory: '/Users/dev/meshek-io',
    projectName: 'meshek-io',
    status: 'stale',
    lastUpdated: Date.now() - 600000,
  },
];

describe('SessionStore', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
  });

  it('starts with empty sessions', () => {
    expect(useSessionStore.getState().sessions).toEqual([]);
  });

  it('updates sessions on handleSessionListUpdate', () => {
    useSessionStore.getState().handleSessionListUpdate(mockSessions);
    expect(useSessionStore.getState().sessions).toHaveLength(2);
    expect(useSessionStore.getState().sessions[0].sessionId).toBe('ses_1');
  });

  it('replaces sessions on subsequent updates', () => {
    useSessionStore.getState().handleSessionListUpdate(mockSessions);
    useSessionStore.getState().handleSessionListUpdate([mockSessions[0]]);
    expect(useSessionStore.getState().sessions).toHaveLength(1);
  });

  it('resets to empty', () => {
    useSessionStore.getState().handleSessionListUpdate(mockSessions);
    useSessionStore.getState().reset();
    expect(useSessionStore.getState().sessions).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/src/stores/session.store.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement session store**

Create `src/renderer/src/stores/session.store.ts`:

```typescript
import { create } from 'zustand';
import type { SessionListItem } from '../../../shared/types';

interface SessionStoreState {
  sessions: SessionListItem[];
  handleSessionListUpdate: (sessions: SessionListItem[]) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionStoreState>((set) => ({
  sessions: [],
  handleSessionListUpdate: (sessions) => set({ sessions }),
  reset: () => set({ sessions: [] }),
}));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/src/stores/session.store.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/stores/session.store.ts tests/src/stores/session.store.test.ts
git commit -m "feat: add session store for lobby session list"
```

---

### Task 4: Add `emitSessionList` to ToolAdapter and update SessionManager

**Files:**
- Modify: `electron/adapters/types.ts`
- Modify: `electron/session-manager.ts`
- Modify: `tests/electron/session-manager.test.ts`

- [ ] **Step 1: Add `emitSessionList` to `ToolAdapter`**

In `electron/adapters/types.ts`, add `SessionListItem` to the existing import from `'../../shared/types'`:

```typescript
import type { AgentEvent, AgentRole, SessionListItem } from '../../shared/types';
```

Then add after `emitAgentEvent` (~line 17):

```typescript
protected emitSessionList(sessions: SessionListItem[]): void {
  this.emit('sessionListUpdate', sessions);
}
```

- [ ] **Step 2: Update SessionManager to forward session list events**

In `electron/session-manager.ts`, add `SessionListItem` to the existing import from `'../shared/types'`:

```typescript
import type { AgentEvent, SessionListItem } from '../shared/types';
```

Then inside the `start()` method, add after the `agentEvent` listener (~line 20):

```typescript
adapter.on('sessionListUpdate', (sessions: SessionListItem[]) => {
  this.emit('sessionListUpdate', sessions);
});
```

- [ ] **Step 3: Add test for session list forwarding**

Add to `tests/electron/session-manager.test.ts`:

```typescript
it('forwards sessionListUpdate from adapters', () => {
  const lists: any[] = [];
  manager.on('sessionListUpdate', (s: any) => lists.push(s));
  manager.start({ projectDir: '/tmp/test' });

  (adapter1 as any).emit('sessionListUpdate', [
    { sessionId: 'ses_1', title: 'Test', directory: '/tmp', projectName: 'tmp', status: 'busy', lastUpdated: 1000 },
  ]);

  expect(lists).toHaveLength(1);
  expect(lists[0][0].sessionId).toBe('ses_1');
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/electron/session-manager.test.ts`
Expected: All tests PASS (including the new one)

- [ ] **Step 5: Commit**

```bash
git add electron/adapters/types.ts electron/session-manager.ts tests/electron/session-manager.test.ts
git commit -m "feat: add session list event pipeline through ToolAdapter and SessionManager"
```

---

### Task 5: Update preload and main process IPC

**Files:**
- Modify: `electron/preload.ts`
- Modify: `electron/main.ts`

- [ ] **Step 1: Add `onSessionListUpdate` to preload**

In `electron/preload.ts`, add after the `onKanbanUpdate` method (~line 25):

First, add `SessionListItem` to the existing import at the top:

```typescript
import type { AgentEvent, ConnectionStatus, KanbanState, AgentRole, SessionInfo, SessionListItem } from '../shared/types';
```

Then add the method:

```typescript
onSessionListUpdate(callback: (sessions: SessionListItem[]) => void): () => void {
  const handler = (_: Electron.IpcRendererEvent, sessions: SessionListItem[]) => callback(sessions);
  ipcRenderer.on(IPC_CHANNELS.SESSION_LIST_UPDATE, handler);
  return () => ipcRenderer.removeListener(IPC_CHANNELS.SESSION_LIST_UPDATE, handler);
},
```

- [ ] **Step 2: Forward session list events in main.ts**

In `electron/main.ts`, inside `setupAdapters()`, add after the `agentEvent` listener (~line 67):

First, add `SessionListItem` to the import from `'../shared/types'`.

Then add:

```typescript
sessionManager.on('sessionListUpdate', (sessions: SessionListItem[]) => {
  if (mainWindow && windowReady) {
    mainWindow.webContents.send(IPC_CHANNELS.SESSION_LIST_UPDATE, sessions);
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add electron/preload.ts electron/main.ts
git commit -m "feat: wire session list IPC from main to renderer"
```

---

## Chunk 2: OpenCode Adapter Refactor

### Task 6: Refactor OpenCode adapter

**Files:**
- Modify: `electron/adapters/opencode.adapter.ts`
- Create: `tests/electron/adapters/opencode.adapter.session-list.test.ts`

- [ ] **Step 1: Write failing tests for session list emission**

Create `tests/electron/adapters/opencode.adapter.session-list.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenCodeAdapter } from '../../../electron/adapters/opencode.adapter';
import type { SessionListItem } from '../../../shared/types';

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    readFileSync: vi.fn(() => Buffer.from('mock sqlite database')),
    existsSync: vi.fn(() => true),
  };
});

let mockSessionRows: any[] = [];
let mockActivityParts: Record<string, { data: string; timeUpdated: number } | null> = {};

// Track prepared statements for parameterized queries
let lastPreparedSql = '';
let mockPreparedResult: any = null;

vi.mock('sql.js', () => ({
  default: vi.fn().mockImplementation(() => ({
    Database: vi.fn().mockImplementation(() => ({
      exec: vi.fn((sql: string) => {
        if (sql.includes('FROM session')) {
          return mockSessionRows.length ? [{ columns: ['id','title','directory','project_id','time_created','time_updated'], values: mockSessionRows }] : [];
        }
        if (sql.includes('FROM part') && !sql.includes('LIMIT 1')) {
          // Existing watermark-based part query — return empty for these tests
          return [];
        }
        return [];
      }),
      prepare: vi.fn((sql: string) => {
        lastPreparedSql = sql;
        return {
          bind: vi.fn((params: any[]) => {
            const sessionId = params[0];
            const activity = mockActivityParts[sessionId];
            if (activity) {
              mockPreparedResult = { data: activity.data, time_updated: activity.timeUpdated };
            } else {
              mockPreparedResult = null;
            }
            return {
              step: vi.fn(() => mockPreparedResult !== null),
              get: vi.fn(() => mockPreparedResult ? [mockPreparedResult.data, mockPreparedResult.time_updated] : null),
              free: vi.fn(),
            };
          }),
        };
      }),
      close: vi.fn(),
    })),
  })),
}));

describe('OpenCodeAdapter — session list', () => {
  let adapter: OpenCodeAdapter;
  let sessionLists: SessionListItem[][];

  beforeEach(() => {
    vi.useFakeTimers();
    adapter = new OpenCodeAdapter('/fake/opencode.db');
    sessionLists = [];
    adapter.on('sessionListUpdate', (s: SessionListItem[]) => sessionLists.push(s));
    mockSessionRows = [];
    mockActivityParts = {};
  });

  afterEach(() => {
    adapter.stop();
    vi.useRealTimers();
  });

  it('emits session list with all top-level sessions', async () => {
    mockSessionRows = [
      ['ses_1', 'Session A', '/projects/app-a', 'proj_1', 1000, 2000],
      ['ses_2', 'Session B', '/projects/app-b', 'proj_2', 1000, 1500],
    ];
    await adapter.start({ projectDir: '/irrelevant' });

    expect(sessionLists).toHaveLength(1);
    expect(sessionLists[0]).toHaveLength(2);
    expect(sessionLists[0][0].sessionId).toBe('ses_1');
    expect(sessionLists[0][0].projectName).toBe('app-a');
    expect(sessionLists[0][1].projectName).toBe('app-b');
  });

  it('detects busy status from step-start part', async () => {
    const now = Date.now();
    mockSessionRows = [['ses_1', 'Test', '/projects/app', 'p1', 1000, now]];
    mockActivityParts['ses_1'] = { data: JSON.stringify({ type: 'step-start' }), timeUpdated: now };
    await adapter.start({ projectDir: '/irrelevant' });

    expect(sessionLists[0][0].status).toBe('busy');
  });

  it('detects waiting status from recent step-finish stop', async () => {
    const now = Date.now();
    mockSessionRows = [['ses_1', 'Test', '/projects/app', 'p1', 1000, now]];
    mockActivityParts['ses_1'] = { data: JSON.stringify({ type: 'step-finish', reason: 'stop' }), timeUpdated: now };
    await adapter.start({ projectDir: '/irrelevant' });

    expect(sessionLists[0][0].status).toBe('waiting');
  });

  it('detects stale status from old step-finish stop', async () => {
    const old = Date.now() - 15 * 60 * 1000; // 15 min ago
    mockSessionRows = [['ses_1', 'Test', '/projects/app', 'p1', 1000, old]];
    mockActivityParts['ses_1'] = { data: JSON.stringify({ type: 'step-finish', reason: 'stop' }), timeUpdated: old };
    await adapter.start({ projectDir: '/irrelevant' });

    expect(sessionLists[0][0].status).toBe('stale');
  });

  it('detects busy status from step-finish tool-calls', async () => {
    const now = Date.now();
    mockSessionRows = [['ses_1', 'Test', '/projects/app', 'p1', 1000, now]];
    mockActivityParts['ses_1'] = { data: JSON.stringify({ type: 'step-finish', reason: 'tool-calls' }), timeUpdated: now };
    await adapter.start({ projectDir: '/irrelevant' });

    expect(sessionLists[0][0].status).toBe('busy');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/electron/adapters/opencode.adapter.session-list.test.ts`
Expected: FAIL — `sessionListUpdate` event is never emitted

- [ ] **Step 3: Refactor the adapter**

Rewrite `electron/adapters/opencode.adapter.ts`. Key changes:

1. Remove `projectDir` filtering from session query
2. Add `parent_id IS NULL AND time_archived IS NULL` filter
3. Add session list emission with activity status detection
4. Use parameterized queries via `db.prepare(sql).bind([params])` for per-session queries (sql.js `exec` doesn't support params, but `prepare/bind` does)
5. Extract `projectName` from `path.basename(directory)`

The session query changes to:

```sql
SELECT id, title, directory, project_id, time_created, time_updated
FROM session
WHERE parent_id IS NULL AND time_archived IS NULL
ORDER BY time_updated DESC
```

Add an `ACTIVITY_TIMEOUT` constant and a status cache:

```typescript
const ACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 minutes

// Cache to avoid re-querying parts for unchanged sessions
private statusCache = new Map<string, { timeUpdated: number; status: 'busy' | 'waiting' | 'stale' }>();
```

Add a `getSessionStatus` method using parameterized queries via `db.prepare/bind`:

```typescript
private getSessionStatus(sessionId: string, sessionTimeUpdated: number): 'busy' | 'waiting' | 'stale' {
  if (!this.db) return 'stale';

  // Use cached status if session hasn't changed
  const cached = this.statusCache.get(sessionId);
  if (cached && cached.timeUpdated === sessionTimeUpdated) return cached.status;

  const stmt = this.db.prepare(
    'SELECT data, time_updated FROM part WHERE session_id = ? ORDER BY time_updated DESC LIMIT 1'
  );
  stmt.bind([sessionId]);

  let status: 'busy' | 'waiting' | 'stale' = 'stale';
  if (stmt.step()) {
    const [data, timeUpdated] = stmt.get() as [string, number];
    try {
      const parsed: Record<string, unknown> = JSON.parse(data);
      if (parsed.type === 'step-start') status = 'busy';
      else if (parsed.type === 'step-finish') {
        if (parsed.reason === 'tool-calls') status = 'busy';
        else if (parsed.reason === 'stop' && Date.now() - timeUpdated < ACTIVITY_TIMEOUT) status = 'waiting';
      }
    } catch { /* stale */ }
  }
  stmt.free();

  this.statusCache.set(sessionId, { timeUpdated: sessionTimeUpdated, status });
  return status;
}
```

In the `poll()` method, after fetching sessions, build and emit the session list:

```typescript
import * as path from 'path';

// After fetching sessionRows, before the per-session part processing:
const sessionList: SessionListItem[] = sessionRows.map(session => ({
  sessionId: session.id,
  title: session.title,
  directory: session.directory,
  projectName: path.basename(session.directory) || session.directory,
  status: this.getSessionStatus(session.id, session.time_updated),
  lastUpdated: session.time_updated,
}));
this.emitSessionList(sessionList);
```

Update the `SessionRow` interface to include the new columns:

```typescript
interface SessionRow {
  id: string;
  title: string;
  directory: string;
  project_id: string;
  time_created: number;
  time_updated: number;
}
```

Update the session row mapping to match the new query (6 columns instead of 4):

```typescript
const sessionRows: SessionRow[] = sessions[0].values.map(row => ({
  id: row[0] as string,
  title: row[1] as string,
  directory: row[2] as string,
  project_id: row[3] as string,
  time_created: row[4] as number,
  time_updated: row[5] as number,
}));
```

Add the `SessionListItem` import:

```typescript
import type { AgentEvent, SessionListItem } from '../../shared/types';
```

- [ ] **Step 4: Run new tests**

Run: `npx vitest run tests/electron/adapters/opencode.adapter.session-list.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Run existing adapter tests**

Run: `npx vitest run tests/electron/adapters/opencode.adapter.test.ts`
Expected: Existing tests may need updates since the session query changed (no longer filters by directory). Update the mock to return 6 columns per row and remove the directory match expectation.

Update `tests/electron/adapters/opencode.adapter.test.ts` — change session row format from 4 columns `[id, title, directory, time_updated]` to 6 columns `[id, title, directory, project_id, time_created, time_updated]`:

```typescript
// Example: update all sessionRows to 6-column format:
// Before: ['ses_1', 'Test session', '/my/project', 1000]
// After:  ['ses_1', 'Test session', '/my/project', 'proj_1', 500, 1000]
```

Also remove the directory-matching test (`'emits no events when no sessions match the project directory'`) since the adapter no longer filters by directory.

- [ ] **Step 6: Run all adapter tests**

Run: `npx vitest run tests/electron/adapters/`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add electron/adapters/opencode.adapter.ts tests/electron/adapters/
git commit -m "feat: refactor OpenCode adapter to poll all sessions with activity detection"
```

---

## Chunk 3: Renderer Event Routing & Screen Architecture

### Task 7: Update renderer event routing

**Files:**
- Modify: `src/renderer/src/main.tsx`

- [ ] **Step 1: Add session list subscription and filter agent events**

Replace the contents of `src/renderer/src/main.tsx`:

```typescript
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useOfficeStore } from './stores/office.store';
import { useChatStore } from './stores/chat.store';
import { useKanbanStore } from './stores/kanban.store';
import { useSessionStore } from './stores/session.store';
import { useAppStore } from './stores/app.store';

function initStoreSubscriptions() {
  if (!window.office) {
    console.log('[Renderer] No office API available');
    return;
  }

  console.log('[Renderer] Subscribing to IPC events');

  window.office.onAgentEvent((event) => {
    const selectedId = useAppStore.getState().selectedSessionId;
    if (!selectedId || event.agentId !== selectedId) return;
    useOfficeStore.getState().handleAgentEvent(event);
    useChatStore.getState().handleAgentEvent(event);
  });

  window.office.onSessionListUpdate((sessions) => {
    useSessionStore.getState().handleSessionListUpdate(sessions);

    // Auto-navigate to lobby if selected session disappears
    const selectedId = useAppStore.getState().selectedSessionId;
    if (selectedId && !sessions.some(s => s.sessionId === selectedId)) {
      useAppStore.getState().navigateToLobby();
    }
  });

  window.office.onKanbanUpdate((state) => {
    useKanbanStore.getState().handleKanbanUpdate(state);
  });

  window.office.getKanbanState().then((state) => {
    if (state) useKanbanStore.getState().handleKanbanUpdate(state);
  });
}

initStoreSubscriptions();

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/main.tsx
git commit -m "feat: route session list events and filter agent events by selected session"
```

---

### Task 8: Create OfficeScreen

**Files:**
- Create: `src/renderer/src/screens/OfficeScreen.tsx`

- [ ] **Step 1: Extract office layout from App.tsx into OfficeScreen**

Create `src/renderer/src/screens/OfficeScreen.tsx`:

```typescript
import React from 'react';
import { ChatPanel } from '../components/ChatPanel/ChatPanel';
import { TopBar } from '../components/TopBar/TopBar';
import { StatsOverlay } from '../components/StatsOverlay/StatsOverlay';
import { OfficeCanvas } from '../office/OfficeCanvas';

export function OfficeScreen() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0f0f1a', color: '#e5e5e5' }}>
      <TopBar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        <ChatPanel />
        <OfficeCanvas />
        <StatsOverlay />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/screens/OfficeScreen.tsx
git commit -m "feat: extract OfficeScreen from App"
```

---

### Task 9: Create LobbyScreen, LobbyCanvas, LobbyScene

**Files:**
- Create: `src/renderer/src/assets/lobby-layout.json`
- Create: `src/renderer/src/lobby/LobbyScene.ts`
- Create: `src/renderer/src/lobby/LobbyCanvas.tsx`
- Create: `src/renderer/src/screens/LobbyScreen.tsx`

- [ ] **Step 1: Create lobby tilemap**

Create `src/renderer/src/assets/lobby-layout.json`. A small 20x14 lobby with walls, floor, and a reception desk area:

```json
{
  "width": 20,
  "height": 14,
  "tileSize": 16,
  "zones": {
    "lobby": { "x": 1, "y": 1, "w": 18, "h": 12 },
    "reception": { "x": 7, "y": 8, "w": 6, "h": 3 }
  },
  "tiles": [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,1,0,0,0,0,1,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
  ]
}
```

- [ ] **Step 2: Create LobbyScene**

Create `src/renderer/src/lobby/LobbyScene.ts`:

```typescript
import { Application, Container, Graphics } from 'pixi.js';
import { TileMap, TileType } from '../office/engine/tilemap';
import lobbyLayout from '../assets/lobby-layout.json';

const FLOOR_COLOR = 0x3a3a5a;
const WALL_COLOR = 0x5a5a7a;
const DESK_COLOR = 0x8b6914;

export class LobbyScene {
  private app: Application;
  private worldContainer: Container;
  private tileMap: TileMap;

  constructor(app: Application) {
    this.app = app;
    this.worldContainer = new Container();
    this.app.stage.addChild(this.worldContainer);

    this.tileMap = new TileMap(lobbyLayout);
    this.drawTiles();
    this.drawReceptionDesk();
    this.centerCamera();
  }

  private drawTiles(): void {
    const g = new Graphics();
    for (let y = 0; y < this.tileMap.height; y++) {
      for (let x = 0; x < this.tileMap.width; x++) {
        const tile = this.tileMap.getTile(x, y);
        if (tile === TileType.Void) continue;
        const color = tile === TileType.Floor ? FLOOR_COLOR : WALL_COLOR;
        g.rect(x * this.tileMap.tileSize, y * this.tileMap.tileSize, this.tileMap.tileSize, this.tileMap.tileSize);
        g.fill(color);
      }
    }
    this.worldContainer.addChild(g);
  }

  private drawReceptionDesk(): void {
    const g = new Graphics();
    const zone = lobbyLayout.zones.reception;
    const ts = this.tileMap.tileSize;
    // Draw desk surface
    g.rect(zone.x * ts + 2, zone.y * ts + 2, zone.w * ts - 4, zone.h * ts - 4);
    g.fill(DESK_COLOR);
    // Desk border
    g.rect(zone.x * ts + 2, zone.y * ts + 2, zone.w * ts - 4, zone.h * ts - 4);
    g.stroke({ width: 1, color: 0x6b4f10 });
    this.worldContainer.addChild(g);
  }

  private centerCamera(): void {
    const worldW = this.tileMap.width * this.tileMap.tileSize;
    const worldH = this.tileMap.height * this.tileMap.tileSize;
    const zoom = 2.5;
    this.worldContainer.scale.set(zoom);
    this.worldContainer.x = this.app.screen.width / 2 - (worldW * zoom) / 2;
    this.worldContainer.y = this.app.screen.height / 2 - (worldH * zoom) / 2;
  }

  onResize(): void {
    this.centerCamera();
  }
}
```

- [ ] **Step 3: Create LobbyCanvas**

Create `src/renderer/src/lobby/LobbyCanvas.tsx`:

```typescript
import 'pixi.js/unsafe-eval';
import React, { useRef, useEffect } from 'react';
import { Application } from 'pixi.js';
import { LobbyScene } from './LobbyScene';

export function LobbyCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const app = new Application();
    let scene: LobbyScene | null = null;

    const init = async () => {
      await app.init({
        background: '#1a1a2e',
        resizeTo: container,
        antialias: false,
        roundPixels: true,
        resolution: 1,
      });
      container.appendChild(app.canvas);
      scene = new LobbyScene(app);
    };

    init();

    const onResize = () => scene?.onResize();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      app.destroy(true, { children: true });
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, overflow: 'hidden', imageRendering: 'pixelated' }}
    />
  );
}
```

- [ ] **Step 4: Create LobbyScreen**

Create `src/renderer/src/screens/LobbyScreen.tsx`:

```typescript
import React from 'react';
import { SessionPanel } from '../components/SessionPanel/SessionPanel';
import { LobbyCanvas } from '../lobby/LobbyCanvas';

export function LobbyScreen() {
  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0f0f1a', color: '#e5e5e5' }}>
      <SessionPanel />
      <LobbyCanvas />
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/assets/lobby-layout.json src/renderer/src/lobby/ src/renderer/src/screens/LobbyScreen.tsx
git commit -m "feat: add lobby screen with pixel art scene"
```

---

### Task 10: Create SessionPanel

**Files:**
- Create: `src/renderer/src/components/SessionPanel/SessionPanel.tsx`

- [ ] **Step 1: Implement SessionPanel**

Create `src/renderer/src/components/SessionPanel/SessionPanel.tsx`:

```typescript
import React from 'react';
import { useSessionStore } from '../../stores/session.store';
import { useAppStore } from '../../stores/app.store';
import type { SessionListItem } from '@shared/types';

const STATUS_COLORS: Record<SessionListItem['status'], string> = {
  busy: '#4ade80',
  waiting: '#f59e0b',
  stale: '#6b7280',
};

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function SessionCard({ session }: { session: SessionListItem }) {
  const navigateToOffice = useAppStore((s) => s.navigateToOffice);
  const statusColor = STATUS_COLORS[session.status];

  return (
    <button
      onClick={() => navigateToOffice(session.sessionId, session.title)}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '10px 12px',
        background: 'rgba(42, 42, 74, 0.3)',
        border: '1px solid #2a2a4a',
        borderRadius: 6,
        color: '#e5e5e5',
        cursor: 'pointer',
        transition: 'background 0.15s ease, border-color 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(42, 42, 74, 0.6)';
        e.currentTarget.style.borderColor = '#4a4a6a';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(42, 42, 74, 0.3)';
        e.currentTarget.style.borderColor = '#2a2a4a';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <div style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: statusColor,
          boxShadow: session.status === 'busy' ? `0 0 6px ${statusColor}` : 'none',
        }} />
        <span style={{ fontWeight: 600, fontSize: 12 }}>{session.projectName}</span>
      </div>
      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {session.title}
      </div>
      <div style={{ fontSize: 10, color: '#6b7280' }}>
        {timeAgo(session.lastUpdated)}
      </div>
    </button>
  );
}

export function SessionPanel() {
  const sessions = useSessionStore((s) => s.sessions);

  // Group by project directory
  const grouped = sessions.reduce<Record<string, SessionListItem[]>>((acc, s) => {
    const key = s.directory;
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  return (
    <div style={{
      width: 320,
      minWidth: 320,
      borderRight: '1px solid #2a2a4a',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '16px 16px 12px',
        borderBottom: '1px solid #2a2a4a',
        fontSize: 14,
        fontWeight: 600,
        color: '#e5e5e5',
      }}>
        Building Directory
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sessions.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#6b7280', fontSize: 12, marginTop: 40 }}>
            No active sessions
          </div>
        ) : (
          Object.entries(grouped).map(([dir, items]) => (
            <div key={dir} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 2px' }}>
                {items[0].projectName}
              </div>
              {items.map((session) => (
                <SessionCard key={session.sessionId} session={session} />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/SessionPanel/SessionPanel.tsx
git commit -m "feat: add SessionPanel component for lobby"
```

---

### Task 11: Wire up App.tsx screen switching

**Files:**
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Replace App.tsx with screen switcher**

```typescript
import React from 'react';
import { useAppStore } from './stores/app.store';
import { LobbyScreen } from './screens/LobbyScreen';
import { OfficeScreen } from './screens/OfficeScreen';

export function App() {
  const screen = useAppStore((s) => s.screen);

  if (screen === 'office') {
    return <OfficeScreen />;
  }

  return <LobbyScreen />;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat: add screen switching between lobby and office"
```

---

### Task 12: Add back button to TopBar

**Files:**
- Modify: `src/renderer/src/components/TopBar/TopBar.tsx`

- [ ] **Step 1: Add back button and store resets**

Update `TopBar.tsx`. Add imports for `useAppStore` and `useChatStore`. Add a back button that navigates to lobby (store resets are handled by `navigateToLobby` in `app.store`):

```typescript
import React, { useState, useEffect } from 'react';
import { useChatStore } from '../../stores/chat.store';
import { useAppStore } from '../../stores/app.store';
import type { ConnectionStatus } from '@shared/types';

export function TopBar() {
  const totalCost = useChatStore((s) => s.totalCost);
  const totalTokens = useChatStore((s) => s.totalTokens);
  const sessionTitle = useAppStore((s) => s.selectedSessionTitle);
  const navigateToLobby = useAppStore((s) => s.navigateToLobby);
  const [connection, setConnection] = useState<ConnectionStatus>({
    claudeCode: 'disconnected',
    openCode: 'disconnected',
  });

  useEffect(() => {
    if (!(window as any).office?.onConnectionStatus) return;
    const unsub = (window as any).office.onConnectionStatus(setConnection);
    return unsub;
  }, []);

  const handleBack = () => {
    navigateToLobby(); // Store resets happen inside navigateToLobby
  };

  const dot = (status: string) => {
    const color = status === 'connected' ? '#4ade80' : status === 'error' ? '#ef4444' : '#6b7280';
    return (
      <span style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        marginRight: 4,
      }} />
    );
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: '6px 16px',
      background: '#0a0a18',
      borderBottom: '1px solid #2a2a4a',
      fontSize: 12,
      color: '#9ca3af',
    }}>
      <button
        onClick={handleBack}
        style={{
          background: 'none',
          border: '1px solid #2a2a4a',
          borderRadius: 4,
          color: '#9ca3af',
          cursor: 'pointer',
          padding: '2px 8px',
          fontSize: 11,
        }}
      >
        Back to Lobby
      </button>
      {sessionTitle && (
        <span style={{ color: '#e5e5e5', fontWeight: 500 }}>{sessionTitle}</span>
      )}
      <span>{dot(connection.claudeCode)} Claude Code</span>
      <span>{dot(connection.openCode)} OpenCode</span>
      <span style={{ marginLeft: 'auto' }}>${totalCost.toFixed(2)}</span>
      <span>{(totalTokens / 1000).toFixed(1)}k tokens</span>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/TopBar/TopBar.tsx
git commit -m "feat: add back-to-lobby button in TopBar with store resets"
```

---

## Chunk 4: Cleanup & Integration

### Task 13: Clean up office store

**Files:**
- Modify: `src/renderer/src/stores/office.store.ts`

- [ ] **Step 1: Remove `focusedSessionId` and `setFocusedSession`**

These were added for the now-removed SessionSelector. Specific changes:

1. In the `OfficeState` interface, remove:
   - `focusedSessionId: string | null;`
   - `setFocusedSession: (sessionId: string | null) => void;`

2. In the `create<OfficeState>` body, remove:
   - `focusedSessionId: null,`
   - The `setFocusedSession` implementation

3. In `handleAgentEvent`, inside the `agent:closed` case:
   - Remove the `const update: Partial<OfficeState>` variable
   - Remove the `if (event.type === 'agent:closed' && get().focusedSessionId === event.agentId)` block
   - Change `return update;` back to `return { agents };`

4. Change `reset` to: `reset: () => set({ agents: {} })`

- [ ] **Step 2: Remove `focusedSessionId` usage from OfficeCanvas**

In `src/renderer/src/office/OfficeCanvas.tsx`, remove:
- The `focusedSessionId` subscription
- The `useEffect` that pans the camera based on `focusedSessionId`

- [ ] **Step 3: Update existing office store tests**

Run: `npx vitest run tests/src/stores/office.store.test.ts`
Expected: All tests PASS (the tests don't reference focusedSessionId)

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/stores/office.store.ts src/renderer/src/office/OfficeCanvas.tsx
git commit -m "refactor: remove focusedSessionId from office store"
```

---

### Task 14: Remove SessionSelector

**Files:**
- Remove: `src/renderer/src/components/SessionSelector/SessionSelector.tsx`

- [ ] **Step 1: Delete the file**

```bash
rm src/renderer/src/components/SessionSelector/SessionSelector.tsx
```

The import was already removed from App.tsx in Task 11.

- [ ] **Step 2: Commit**

```bash
git add -A src/renderer/src/components/SessionSelector/
git commit -m "refactor: remove SessionSelector, replaced by lobby SessionPanel"
```

---

### Task 15: Integration verification

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 2: Start the app**

```bash
npm run dev
```

Expected:
- App launches to the **Lobby screen** — pixel art lobby on the right, session panel on the left
- Session panel shows OpenCode sessions grouped by project, with status dots and timestamps
- Clicking a session navigates to the **Office screen** with TopBar, ChatPanel, OfficeCanvas, StatsOverlay
- TopBar shows "Back to Lobby" button and session title
- Clicking "Back to Lobby" returns to the lobby, all stores reset
- Agent events only appear for the selected session

- [ ] **Step 3: Final commit (if needed)**

Only if there are uncommitted changes after verification:

```bash
git status
# If changes exist:
git add <changed-files>
git commit -m "fix: address integration issues from lobby feature"
```
