# Session Panel Toggle — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show Claude Code and OpenCode sessions together in the SessionPanel with source badges and filter toggles.

**Architecture:** Add `source` field to `SessionListItem`, make the transcript adapter emit session lists from discovered files, merge lists in SessionManager, and add filter UI to SessionPanel.

**Tech Stack:** TypeScript, Zustand, React, chokidar, Vitest

**Spec:** `docs/superpowers/specs/2026-03-15-session-panel-toggle-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `shared/types.ts` | Modify | Add required `source` to `SessionListItem` |
| `electron/adapters/opencode.adapter.ts` | Modify | Set `source: 'opencode'` on emitted sessions |
| `electron/adapters/claude-transcript.adapter.ts` | Modify | Emit session list from transcript files |
| `electron/session-manager.ts` | Modify | Merge session lists from multiple adapters |
| `electron/main.ts` | Modify | Add `source` check to session linking |
| `src/renderer/src/stores/session.store.ts` | Modify | Add `filter` state |
| `src/renderer/src/components/SessionPanel/SessionPanel.tsx` | Modify | Filter pills + source badges |
| `tests/electron/session-manager.test.ts` | Modify | Test merge behavior |

---

## Chunk 1: Data layer (types + adapters + session manager)

### Task 1: Add `source` to `SessionListItem` and OpenCode adapter

**Files:**
- Modify: `shared/types.ts:86-94`
- Modify: `electron/adapters/opencode.adapter.ts:116-124`

- [ ] **Step 1: Add `source` field to `SessionListItem`**

In `shared/types.ts`, change `SessionListItem` (line 86-94) to:

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

- [ ] **Step 2: Set `source: 'opencode'` in OpenCode adapter**

In `electron/adapters/opencode.adapter.ts`, in the `sessionList` mapping (around line 116-124), add `source: 'opencode'` to each emitted item:

```typescript
const sessionList: SessionListItem[] = sessionRows.map(session => ({
  sessionId: session.id,
  title: session.title,
  directory: session.directory,
  projectName: path.basename(session.directory) || session.directory,
  status: this.getSessionStatus(session.id, session.time_updated),
  lastUpdated: session.time_updated,
  createdAt: session.time_created,
  source: 'opencode',
}));
```

- [ ] **Step 3: Fix any TypeScript errors from required `source`**

Run: `npx electron-vite build 2>&1 | tail -5`

Any test file or code that creates a `SessionListItem` without `source` will need it added. Check the session-manager test (line 96 of `tests/electron/session-manager.test.ts`) — add `source: 'opencode'` to the test data.

- [ ] **Step 4: Run tests**

Run: `npx vitest run`
Expected: All existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add shared/types.ts electron/adapters/opencode.adapter.ts tests/electron/session-manager.test.ts
git commit -m "feat: add required source field to SessionListItem"
```

---

### Task 2: Make transcript adapter emit session list

**Files:**
- Modify: `electron/adapters/claude-transcript.adapter.ts`

- [ ] **Step 1: Add session tracking state and imports**

Add `SessionListItem` to the import from `../shared/types` (or it's already re-exported via `./types`). Add a new private field:

```typescript
private knownSessions: Map<string, { filePath: string; createdAt: number }> = new Map();
```

- [ ] **Step 2: Change `ignoreInitial` to `false`**

In the `start()` method, line 18, change:
```typescript
ignoreInitial: true,
```
to:
```typescript
ignoreInitial: false,
```

- [ ] **Step 3: Add `buildSessionList()` method**

Add this method to the class:

```typescript
private buildSessionList(): void {
  const sessions: SessionListItem[] = [];
  for (const [sessionId, info] of this.knownSessions) {
    try {
      const stats = fs.statSync(info.filePath);
      const ageMs = Date.now() - stats.mtimeMs;
      let status: SessionListItem['status'] = 'stale';
      if (ageMs < 30_000) status = 'busy';
      else if (ageMs < 600_000) status = 'waiting';

      // Decode directory from path: ~/.claude/projects/-Users-foo-bar/session.jsonl → /Users/foo/bar
      const projectDir = path.basename(path.dirname(info.filePath));
      const directory = projectDir.startsWith('-')
        ? projectDir.slice(1).replace(/-/g, '/')
        : projectDir;

      sessions.push({
        sessionId,
        title: sessionId.slice(0, 8),
        directory: '/' + directory,
        projectName: directory.split('/').pop() || directory,
        status,
        lastUpdated: stats.mtimeMs,
        createdAt: info.createdAt,
        source: 'claude-code',
      });
    } catch {
      // File may have been deleted
    }
  }
  this.emitSessionList(sessions);
}
```

- [ ] **Step 4: Call `buildSessionList()` from file handlers**

Update `handleNewFile` to track the session and rebuild the list:

```typescript
private async handleNewFile(filePath: string): Promise<void> {
  const sessionId = this.getSessionId(filePath);
  this.filePositions.set(filePath, 0);
  try {
    const stats = fs.statSync(filePath);
    this.knownSessions.set(sessionId, { filePath, createdAt: stats.birthtimeMs });
  } catch { /* ignore */ }
  this.emitAgentEvent({
    agentId: sessionId,
    agentRole: this.sessionRoles.get(sessionId) ?? 'freelancer',
    source: 'transcript',
    type: 'agent:created',
    timestamp: Date.now(),
  });
  this.buildSessionList();
  await this.readNewLines(filePath);
}
```

Update `handleFileChange` to rebuild the list:

```typescript
private async handleFileChange(filePath: string): Promise<void> {
  await this.readNewLines(filePath);
  this.buildSessionList();
}
```

- [ ] **Step 5: Clear `knownSessions` in `stop()`**

In the `stop()` method, add:
```typescript
this.knownSessions.clear();
```

- [ ] **Step 6: Build to verify**

Run: `npx electron-vite build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add electron/adapters/claude-transcript.adapter.ts
git commit -m "feat: emit session list from Claude Code transcript adapter"
```

---

### Task 3: Merge session lists in SessionManager

**Files:**
- Modify: `electron/session-manager.ts`
- Modify: `tests/electron/session-manager.test.ts`

- [ ] **Step 1: Add per-adapter session storage**

In `SessionManager`, add a field:

```typescript
private adapterSessions: Map<ToolAdapter, SessionListItem[]> = new Map();
```

- [ ] **Step 2: Update the `sessionListUpdate` listener to merge**

In the `start()` method, replace the current `sessionListUpdate` forwarding (line 21-23):

```typescript
adapter.on('sessionListUpdate', (sessions: SessionListItem[]) => {
  this.emit('sessionListUpdate', sessions);
});
```

with:

```typescript
adapter.on('sessionListUpdate', (sessions: SessionListItem[]) => {
  this.adapterSessions.set(adapter, sessions);
  const merged = Array.from(this.adapterSessions.values()).flat();
  this.emit('sessionListUpdate', merged);
});
```

- [ ] **Step 3: Clear adapterSessions in `stop()`**

Add `this.adapterSessions.clear();` in the `stop()` method.

- [ ] **Step 4: Add merge test**

In `tests/electron/session-manager.test.ts`, add:

```typescript
it('merges session lists from multiple adapters', () => {
  const lists: any[] = [];
  manager.on('sessionListUpdate', (s: any) => lists.push(s));
  manager.start({ projectDir: '/tmp/test' });

  adapter1.triggerSessionListUpdate([
    { sessionId: 'ses_1', title: 'OC Session', directory: '/tmp', projectName: 'tmp', status: 'busy', lastUpdated: 1000, createdAt: 900, source: 'opencode' },
  ]);
  adapter2.triggerSessionListUpdate([
    { sessionId: 'cc-abc', title: 'CC Session', directory: '/tmp', projectName: 'tmp', status: 'waiting', lastUpdated: 2000, createdAt: 1900, source: 'claude-code' },
  ]);

  // Last emitted list should contain both
  const latest = lists[lists.length - 1];
  expect(latest).toHaveLength(2);
  expect(latest.find((s: any) => s.source === 'opencode')).toBeDefined();
  expect(latest.find((s: any) => s.source === 'claude-code')).toBeDefined();
});

it('updates only the changed adapter sessions on re-emit', () => {
  const lists: any[] = [];
  manager.on('sessionListUpdate', (s: any) => lists.push(s));
  manager.start({ projectDir: '/tmp/test' });

  adapter1.triggerSessionListUpdate([
    { sessionId: 'ses_1', title: 'OC', directory: '/tmp', projectName: 'tmp', status: 'busy', lastUpdated: 1000, createdAt: 900, source: 'opencode' },
  ]);
  adapter2.triggerSessionListUpdate([
    { sessionId: 'cc-1', title: 'CC', directory: '/tmp', projectName: 'tmp', status: 'busy', lastUpdated: 2000, createdAt: 1900, source: 'claude-code' },
  ]);
  // adapter1 re-emits with updated session
  adapter1.triggerSessionListUpdate([
    { sessionId: 'ses_1', title: 'OC Updated', directory: '/tmp', projectName: 'tmp', status: 'waiting', lastUpdated: 3000, createdAt: 900, source: 'opencode' },
  ]);

  const latest = lists[lists.length - 1];
  expect(latest).toHaveLength(2);
  expect(latest.find((s: any) => s.sessionId === 'ses_1').title).toBe('OC Updated');
  expect(latest.find((s: any) => s.sessionId === 'cc-1')).toBeDefined();
});
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/electron/session-manager.test.ts`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add electron/session-manager.ts tests/electron/session-manager.test.ts
git commit -m "feat: merge session lists from multiple adapters in SessionManager"
```

---

### Task 4: Add source-aware session linking in main.ts

**Files:**
- Modify: `electron/main.ts:76-81`

- [ ] **Step 1: Add source check to session linking**

In `electron/main.ts`, update the session matching logic (around line 78) from:

```typescript
const match = sessions.find(s =>
  s.directory === pendingSession!.directory &&
  s.createdAt > pendingSession!.createdAt - 2000
);
```

to:

```typescript
const expectedSource = pendingSession!.tool === 'claude-code' ? 'claude-code' : 'opencode';
const match = sessions.find(s =>
  s.source === expectedSource &&
  s.directory === pendingSession!.directory &&
  s.createdAt > pendingSession!.createdAt - 2000
);
```

- [ ] **Step 2: Build to verify**

Run: `npx electron-vite build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add electron/main.ts
git commit -m "fix: add source check to session linking to prevent cross-tool false matches"
```

---

## Chunk 2: Store + UI

### Task 5: Add filter state to session store

**Files:**
- Modify: `src/renderer/src/stores/session.store.ts`

- [ ] **Step 1: Add filter state and setter**

Replace the entire file:

```typescript
import { create } from 'zustand';
import type { SessionListItem } from '../../../shared/types';

type SessionFilter = 'all' | 'opencode' | 'claude-code';

interface SessionStoreState {
  sessions: SessionListItem[];
  filter: SessionFilter;
  setFilter: (filter: SessionFilter) => void;
  handleSessionListUpdate: (sessions: SessionListItem[]) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionStoreState>((set) => ({
  sessions: [],
  filter: 'all',
  setFilter: (filter) => set({ filter }),
  handleSessionListUpdate: (sessions) => set({ sessions }),
  reset: () => set({ sessions: [], filter: 'all' }),
}));
```

- [ ] **Step 2: Build to verify**

Run: `npx electron-vite build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/stores/session.store.ts
git commit -m "feat: add filter state to session store"
```

---

### Task 6: Add filter pills and source badges to SessionPanel

**Files:**
- Modify: `src/renderer/src/components/SessionPanel/SessionPanel.tsx`

- [ ] **Step 1: Update SessionPanel with filter UI and badges**

Replace the entire file:

```tsx
import React from 'react';
import { useSessionStore } from '../../stores/session.store';
import { useAppStore } from '../../stores/app.store';
import type { SessionListItem } from '../../../../shared/types';

const STATUS_COLORS: Record<SessionListItem['status'], string> = {
  busy: '#4ade80',
  waiting: '#f59e0b',
  stale: '#6b7280',
};

const SOURCE_BADGE: Record<string, { label: string; color: string }> = {
  opencode: { label: 'OC', color: '#06b6d4' },
  'claude-code': { label: 'CC', color: '#8b5cf6' },
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
  const badge = SOURCE_BADGE[session.source] ?? { label: '??', color: '#6b7280' };

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
        position: 'relative',
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
      <span style={{
        position: 'absolute',
        top: 6,
        right: 8,
        fontSize: 9,
        fontWeight: 700,
        color: badge.color,
        background: `${badge.color}18`,
        padding: '1px 5px',
        borderRadius: 3,
        letterSpacing: '0.03em',
      }}>
        {badge.label}
      </span>
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
      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 30 }}>
        {session.title}
      </div>
      <div style={{ fontSize: 10, color: '#6b7280' }}>
        {timeAgo(session.lastUpdated)}
      </div>
    </button>
  );
}

type FilterValue = 'all' | 'opencode' | 'claude-code';
const FILTERS: { value: FilterValue; label: string }[] = [
  { value: 'opencode', label: 'OC' },
  { value: 'claude-code', label: 'CC' },
];

export function SessionPanel() {
  const sessions = useSessionStore((s) => s.sessions);
  const filter = useSessionStore((s) => s.filter);
  const setFilter = useSessionStore((s) => s.setFilter);

  const filtered = filter === 'all' ? sessions : sessions.filter(s => s.source === filter);

  const grouped = filtered.reduce<Record<string, SessionListItem[]>>((acc, s) => {
    const key = s.directory;
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  const handleFilterClick = (value: FilterValue) => {
    setFilter(filter === value ? 'all' : value);
  };

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
        padding: '12px 16px',
        borderBottom: '1px solid #2a2a4a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#e5e5e5' }}>Sessions</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => handleFilterClick(f.value)}
              style={{
                padding: '2px 8px',
                borderRadius: 4,
                border: filter === f.value ? '1px solid #3b82f6' : '1px solid #2a2a4a',
                background: filter === f.value ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                color: filter === f.value ? '#3b82f6' : '#6b7280',
                fontSize: 10,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 ? (
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

- [ ] **Step 2: Build to verify**

Run: `npx electron-vite build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/SessionPanel/SessionPanel.tsx
git commit -m "feat: add source filter pills and badges to SessionPanel"
```
