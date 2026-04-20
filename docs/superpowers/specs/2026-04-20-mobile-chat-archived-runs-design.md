# Mobile Chat Archived Runs + Uncapped History — Design

**Status:** design approved, pending user review
**Target:** `shared/types/`, `electron/project/chat-history-store.ts`, `electron/mobile-bridge/`, `electron/ipc/state.ts`, `electron/ipc/project-handlers.ts`, `shared/stores/session.store.ts`, `src/mobile-renderer/`
**Decomposition context:** sub-project 3b of 3 on the path to full mobile-chat parity with desktop. Final piece after sub-project 1 (styling), sub-project 2 (live context signals), sub-project 3a (interactive QuestionBubble + phase advance).

---

## Problem

The mobile companion's Chat tab currently shows the most recent 50 messages as a flat list. Two gaps remain versus desktop:

1. **50-message cap.** `CHAT_TAIL_CAP = 50` in both `SnapshotBuilder` (desktop-side) and `shared/stores/session.store.ts` (mobile-side) bounds the flat tail. In a long imagine or build phase the cap drops older messages from mobile; the phone shows only the tail of the conversation.
2. **No archived runs.** When a phase has multiple runs (e.g., user aborted the first imagine and restarted), desktop's `ChatPanel` surfaces older completed runs as collapsible "Run 1 — CEO (3 msgs, Apr 18) ▶" buttons above the live chat. Mobile has no such affordance — only the flat tail is visible.

## Goal

Make the mobile Chat tab's history surface parity with desktop:

- **Uncap the current-run tail.** `chatTail` grows with the live run without loss.
- **Expose archived runs.** Collapsible buttons above the tail, one per older completed run within the current phase, matching desktop's visual pattern exactly.

## Non-Goals

- **Cross-phase archived runs.** Desktop doesn't show them either. Deferring.
- **Lazy / on-demand archived fetch.** Every (re)connect syncs the full archived list in the snapshot. Simpler protocol, fits real-world project sizes (single-digit MB worst-case).
- **Virtualized rendering.** Out of scope. If projects ever produce tens of thousands of messages, virtualization becomes a shared desktop+mobile follow-up.
- **Search inside archived runs.** Desktop doesn't have it.
- **Collapse-all / expand-all.** Nice-to-have, not required.
- **Persisting expansion state across reconnects.** Collapsed/expanded is local UI state; resets on reload (matches desktop).
- **New wire message types.** Everything reuses `SessionSnapshot` + a new `SessionStatePatch` variant.

## Architecture

```
Desktop                                              Mobile
──────────────────────────────────────               ──────────────────────────────────────
ChatHistoryStore.getPhaseHistory(phase)   ┐
  (existing — reads persisted runs         │
   from .the-office/chat/)                 │
    ↓                                      │
new: ChatHistoryStore.computeArchivedRuns │
  → ArchivedRun[] (latest run per role     │
   excluded — that lives in chatTail)      │
    ↓                                      │   SessionSnapshot.archivedRuns
SnapshotBuilder.setArchivedRuns(runs)     ├──▶     (initial sync)
    ↓                                      │        ↓
EventForwarder.onArchivedRuns(runs,       │      Mobile session.store
                             resetTail)   │        applyStatePatch({kind:'archivedRuns',…})
    ↓                                      │        ↓
Broadcasts:                                │      useSessionStore.snapshot.archivedRuns
  - initial snapshot (on connect)          │        ↓
  - new patch {kind:'archivedRuns',        │      ChatView renders <ArchivedRunsList>
    runs, resetTail}                       │        ABOVE the flat chatTail
                                             ┘

Trigger points for re-broadcast:
  1. Project open — load history for current phase, compute, set (resetTail:false)
  2. Phase transition — reload for new phase, set (resetTail:true — clear outgoing phase's tail)
  3. New run within current phase (currentChatRunNumber increments)
     — previous tail content becomes archived; reload, set (resetTail:true)

Uncapping:
  - SnapshotBuilder.ingestChat drops the CHAT_TAIL_CAP = 50 slice.
  - shared/stores/session.store.ts appendChat drops the same cap.
```

### Key design decisions

1. **All-at-once sync over lazy fetch.** Desktop's `loadHistory` is already eager — the mobile-side mirror keeps the protocol flat and avoids adding a new request/reply wire. Bandwidth concern is theoretical at real-world project sizes (~KB per message, compressed).

2. **Run transition mechanism: full re-broadcast of the archived list + `resetTail` flag.** When a new run starts within a phase, the previous tail becomes "archived". Bundling the list replacement and the tail reset into a single patch (`{kind:'archivedRuns', runs, resetTail:true}`) keeps the two state changes atomic. Mobile receives one patch, updates both fields together, no half-synced state.

3. **Current-phase-only archived runs (matches desktop).** When the phone opens during warroom, it sees warroom's archived runs, not imagine's. Matches how desktop's `ChatPanel` calls `getChatHistory(currentPhase)` today.

4. **Mobile component, not desktop reuse.** Desktop's collapsible-run UI is inline JSX in `ChatPanel.tsx`, not a discrete component. Extracting would be a scope-expansion refactor. Writing a small mobile-specific `ArchivedRunsList.tsx` that mirrors desktop's visual pattern is cheaper. Reuses `MessageBubble` + `agentDisplayName` via the same relative-import pattern established in sub-project 1.

5. **`ArchivedRun` type moves to `shared/types/session.ts`.** Desktop's `chat.store.ts` currently declares its own local `ArchivedRun` interface. Mobile needs the same shape. Move the canonical declaration to `shared/types/session.ts` and have `chat.store.ts` import from there — removes duplication in one edit.

## File Changes

### `shared/types/session.ts` — two additions, one move

Move `ArchivedRun` from `src/renderer/src/stores/chat.store.ts` to this file:

```ts
export interface ArchivedRun {
  agentRole: AgentRole;
  runNumber: number;
  messages: ChatMessage[];
  timestamp: number;  // timestamp of first message, used for sort + display date
}
```

Extend `SessionSnapshot`:

```ts
export interface SessionSnapshot {
  // …existing fields from sub-projects 1–3a…
  archivedRuns?: ArchivedRun[];   // NEW — older completed runs within current phase
}
```

Extend `SessionStatePatch`:

```ts
export type SessionStatePatch =
  | { kind: 'phase'; phase: Phase }
  | { kind: 'activeAgent'; agentId: string | null }
  | { kind: 'ended'; ended: boolean }
  | { kind: 'waiting'; payload: AgentWaitingPayload | null }
  | { kind: 'archivedRuns'; runs: ArchivedRun[]; resetTail: boolean };   // NEW
```

### `src/renderer/src/stores/chat.store.ts` — import the shared type

Delete the local `ArchivedRun` interface. Replace:

```ts
import type { ChatMessage, AgentRole, AgentWaitingPayload, AskQuestion, PhaseHistory, ArchivedRun } from '@shared/types';
```

No other changes. Desktop's `loadHistory` continues to use the same shape.

### `electron/project/chat-history-store.ts` — new method

After `getPhaseHistory` (around line 171), add:

```ts
/**
 * Compute archived-run metadata for a phase. Excludes the latest run
 * per agent role — those messages are live in the snapshot's chatTail.
 * Mirrors desktop chat-store's inline logic in `loadHistory`.
 */
computeArchivedRuns(phase: Phase): ArchivedRun[] {
  const history = this.getPhaseHistory(phase);
  const archived: ArchivedRun[] = [];
  for (const entry of history) {
    if (entry.runs.length <= 1) continue;
    for (let i = 0; i < entry.runs.length - 1; i++) {
      const run = entry.runs[i];
      if (run.messages.length === 0) continue;
      archived.push({
        agentRole: entry.agentRole,
        runNumber: run.runNumber,
        messages: run.messages,
        timestamp: run.messages[0].timestamp,
      });
    }
  }
  archived.sort((a, b) => a.timestamp - b.timestamp);
  return archived;
}
```

Import `ArchivedRun` from `'../../shared/types'` if not already imported.

### `electron/mobile-bridge/snapshot-builder.ts` — field, setter, patch handling, uncap

Four edits:

1. New private field `archivedRuns: ArchivedRun[] = [];`
2. New public method `setArchivedRuns(runs)`.
3. `getSnapshot()` conditionally includes `archivedRuns` when non-empty.
4. `applyStatePatch` gains `archivedRuns` case (handles both `runs` replacement and `resetTail`).
5. `ingestChat` drops the `CHAT_TAIL_CAP` slice.
6. `reset()` clears `archivedRuns`.

Uncap:

```ts
ingestChat(messages: ChatMessage[]): void {
  const stamped = messages.map((m) => ({ ...m, phase: m.phase ?? this.phase }));
  this.chatTail = [...this.chatTail, ...stamped];
  // CAP REMOVED — tail grows with the current run; older runs live in archivedRuns
}
```

The `CHAT_TAIL_CAP` constant can be deleted from this file entirely.

### `electron/mobile-bridge/event-forwarder.ts` — new hook

Mirror the shape of the other `on*` hooks:

```ts
onArchivedRuns = (runs: ArchivedRun[], resetTail: boolean): void => {
  try {
    this.snapshots.applyStatePatch({ kind: 'archivedRuns', runs, resetTail });
    this.broadcaster.broadcastToAuthenticated({
      type: 'state', v: 2, patch: { kind: 'archivedRuns', runs, resetTail },
    });
  } catch (err) {
    console.warn('[mobile-bridge] onArchivedRuns failed:', err);
  }
};
```

### `electron/mobile-bridge/index.ts` — expose on facade

Add to the `MobileBridge` interface:

```ts
onArchivedRuns(runs: ArchivedRun[], resetTail: boolean): void;
```

Add `ArchivedRun` to the top import. Add `onArchivedRuns: forwarder.onArchivedRuns` to the factory's returned object, alongside the existing hooks.

### `electron/ipc/state.ts` — new helper + wire three triggers

Add a single helper that both the setters and the project-open handler call:

```ts
/**
 * Recompute the current phase's archived runs and push them to the mobile
 * bridge. `resetTail` true clears the phone's chatTail (phase transition,
 * new run, project switch); false leaves it intact (project open with a
 * still-active run).
 */
export function refreshMobileArchivedRuns(resetTail: boolean): void {
  if (!mobileBridge) return;
  if (!chatHistoryStore || !currentChatPhase) {
    // Nothing to compute yet — broadcast empty with resetTail so the
    // phone's archived list (if any stale) clears.
    mobileBridge.onArchivedRuns([], resetTail);
    return;
  }
  const runs = chatHistoryStore.computeArchivedRuns(currentChatPhase);
  mobileBridge.onArchivedRuns(runs, resetTail);
}
```

Extend `setCurrentChatPhase` (line 172) and `setCurrentChatRunNumber` (line 180):

```ts
export function setCurrentChatPhase(phase: Phase | null): void {
  currentChatPhase = phase;
  refreshMobileArchivedRuns(true);   // NEW — resetTail:true on phase transition
}

export function setCurrentChatRunNumber(n: number): void {
  currentChatRunNumber = n;
  if (n > 0) refreshMobileArchivedRuns(true);   // NEW — new run means old tail becomes archived
}
```

Extend `resetSessionState`:

```ts
export function resetSessionState(): void {
  // …existing body (including the call to refreshMobileArchivedRuns below)…
  mobileBridge?.onArchivedRuns([], true);   // NEW — project switch: clear mobile archived list
}
```

### `electron/ipc/project-handlers.ts` — initial load trigger

At the end of the OPEN_PROJECT handler's successful path (after line ~171 where the restored waiting state is emitted), call:

```ts
refreshMobileArchivedRuns(false);
```

`resetTail:false` because on a clean open with an existing run (nothing yet reset the tail), the phone's reconnect sync already seeded the tail with live content — we don't want to clobber it.

Import added at the top of `project-handlers.ts`:

```ts
  refreshMobileArchivedRuns,
```

inside the existing `from './state'` import block.

Why this sequence works: `setCurrentChatPhase(saved.phase)` at line 157 fires when a restored waiting state exists; that's the `resetTail:true` path. For clean opens without a saved waiting state, `setCurrentChatPhase` may not fire at project-open time — the explicit `refreshMobileArchivedRuns(false)` call at the end guarantees the phone gets the archived list anyway.

### `shared/stores/session.store.ts` — handle the patch + uncap

Extend `applyStatePatch`:

```ts
case 'archivedRuns': {
  const next: SessionSnapshot = { ...current, archivedRuns: patch.runs };
  if (patch.resetTail) next.chatTail = [];
  set({ snapshot: next });
  break;
}
```

Drop the `CHAT_TAIL_CAP` slice from `appendChat`:

```ts
appendChat: (messages) => {
  const current = get().snapshot;
  if (!current) return;
  const merged = [...current.chatTail, ...messages];
  set({ snapshot: { ...current, chatTail: merged } });
  // CAP REMOVED — tail grows with the current run; archived runs hold older material
},
```

Delete the `CHAT_TAIL_CAP` constant.

### `src/mobile-renderer/ArchivedRunsList.tsx` — new component

```tsx
import { useState } from 'react';
import type React from 'react';
import type { ArchivedRun } from '../../shared/types';
import { MessageBubble } from '../renderer/src/components/OfficeView/MessageBubble';
import { agentDisplayName } from '../renderer/src/utils';
import { AGENT_COLORS } from '../../shared/types';

export function ArchivedRunsList({ runs }: { runs: ArchivedRun[] }): React.JSX.Element | null {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  if (runs.length === 0) return null;

  const toggle = (key: string) => {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key); else next.add(key);
    setExpanded(next);
  };

  return (
    <div className="archived-runs">
      {runs.map((run) => {
        const key = `${run.agentRole}-${run.runNumber}`;
        const isOpen = expanded.has(key);
        const color = AGENT_COLORS[run.agentRole] ?? '#999';
        const dateStr = new Date(run.timestamp).toLocaleDateString([], {
          month: 'short', day: 'numeric',
        });
        return (
          <div key={key} className="archived-run">
            <button className="archived-run-header" onClick={() => toggle(key)}>
              <span className="archived-run-caret">{isOpen ? '\u25BC' : '\u25B6'}</span>
              <span className="archived-run-label" style={{ color }}>
                Run {run.runNumber} — {agentDisplayName(run.agentRole)}
              </span>
              <span className="archived-run-meta">
                ({run.messages.length} msg{run.messages.length !== 1 ? 's' : ''}, {dateStr})
              </span>
            </button>
            {isOpen && (
              <div className="archived-run-body">
                {run.messages.map((m) => (
                  <MessageBubble key={m.id} msg={m} isWaiting={false} />
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="archived-runs-divider" />
    </div>
  );
}
```

### `src/mobile-renderer/ChatView.tsx` — one insert

At the top of the `rendered` children array (before any messages are pushed), prepend:

```tsx
const archived = snapshot?.archivedRuns ?? [];
if (archived.length > 0) {
  rendered.push(<ArchivedRunsList key="archived-runs" runs={archived} />);
}
```

Import added:

```tsx
import { ArchivedRunsList } from './ArchivedRunsList';
```

Also: the empty-state check needs updating. Today it's `if (messages.length === 0 && !waiting)`. Extend to `if (messages.length === 0 && !waiting && archived.length === 0)` — an otherwise-empty chat that has archived runs should show the archived list, not the empty state.

### `src/mobile-renderer/style.css` — append rule block

```css
/* Archived runs — collapsible older runs within the current phase.
   Rendered above the current chatTail, matching desktop's ChatPanel. */
.archived-runs {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 0 8px;
}
.archived-run-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  background: #141414;
  border: 1px solid #222;
  border-radius: 6px;
  color: var(--muted);
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  text-align: left;
}
.archived-run-caret {
  color: #666;
  flex-shrink: 0;
}
.archived-run-label {
  font-weight: 600;
}
.archived-run-meta {
  color: #555;
  margin-left: auto;
}
.archived-run-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px 0;
  opacity: 0.7;
}
.archived-runs-divider {
  border-bottom: 1px solid #1f1f1f;
  margin: 4px 0 8px;
}
```

## Edge Cases

**Reconnect.** `archivedRuns` is on `SessionSnapshot`, so reconnect replays current truth. No event-replay needed.

**Phone connects mid-session after a run transition.** The latest `setArchivedRuns(...)` call is what the snapshot carries; the phone gets the current state on first paint.

**`resetTail` with in-flight chatFeed messages.** If a phase transition fires the `resetTail` patch and a live `chatFeed` message was in flight, it arrives after the reset and appends to the now-empty tail — correct.

**Empty archived list.** `<ArchivedRunsList runs={[]}>` returns `null`. `getSnapshot()` omits the field when empty. No empty divider rendered.

**Run with zero messages.** `computeArchivedRuns` skips runs whose `messages` array is empty. Matches desktop's existing behavior.

**Agent role collisions within a phase.** If the same agent has multiple runs, each gets its own archived entry keyed by `${agentRole}-${runNumber}`. No merge.

**Initial snapshot without history.** If `ChatHistoryStore` isn't ready when the phone connects (race), `setArchivedRuns` isn't called and the field is absent. When the store becomes ready, the first trigger (phase change, new run, or project-open's final explicit call) broadcasts the list.

**Project switch.** `resetSessionState` now calls `mobileBridge?.onArchivedRuns([], true)` so the phone's archived list clears as the project closes.

**Desktop and mobile out-of-sync during transition.** Brief window: desktop's `chat.store` refreshes on phase change; mobile's via the patch. Both fire from the same trigger — no lasting divergence.

**Multi-phase history.** Only the current phase's archived runs are sent. User switching phases sees only the new phase's history — matches desktop's existing behavior.

**Very long archived runs (rare).** A single archived run with thousands of messages renders them all on expand. Scroll performance may degrade. Virtualization is a shared follow-up if it becomes an issue.

## Testing Strategy

### Automated (vitest)

**`electron/project/__tests__/chat-history-store.test.ts`** — extend with 4 cases:

1. `computeArchivedRuns` returns empty when each role has only 1 run (that run is the latest).
2. Excludes the latest run per role; includes earlier runs.
3. Returns multiple archived runs sorted by timestamp ascending.
4. Skips runs whose messages array is empty.

**`electron/mobile-bridge/__tests__/snapshot-builder.test.ts`** — extend with 5 cases:

1. `setArchivedRuns(runs)` populates `snapshot.archivedRuns`; empty array omits the field.
2. `ingestChat` no longer caps at 50 — feed 60 messages, assert tail has 60.
3. `applyStatePatch({kind:'archivedRuns', runs, resetTail:true})` replaces runs AND clears chatTail.
4. `applyStatePatch({kind:'archivedRuns', runs, resetTail:false})` replaces runs, keeps chatTail.
5. `reset()` clears archivedRuns.

**`shared/stores/__tests__/session.store.test.ts`** — extend with 3 cases:

1. `archivedRuns` patch with `resetTail:true` updates both fields.
2. `archivedRuns` patch with `resetTail:false` keeps chatTail.
3. `appendChat` no longer caps at 50 — feed 60, assert tail has 60.

**`electron/mobile-bridge/__tests__/event-forwarder.test.ts`** — create if absent, 1 case:

1. `onArchivedRuns(runs, resetTail)` calls `snapshots.applyStatePatch` with the matching patch AND broadcasts the same shape.

**`src/mobile-renderer/__tests__/ArchivedRunsList.test.tsx`** — new, 4 cases:

1. Returns `null` when `runs` is empty.
2. Renders one collapsible button per run with role, run number, message count, date.
3. Clicking a button toggles body visibility.
4. Multiple runs: expanding one doesn't affect others.

**`src/mobile-renderer/__tests__/ChatView.test.tsx`** — extend with 2 cases:

1. `ArchivedRunsList` renders above the current chatTail when `snapshot.archivedRuns` has entries.
2. Empty-state branch doesn't fire when `chatTail` is empty but `archivedRuns` has entries.

### Manual QA (4 scenarios)

1. **Multi-run imagine project** — open a project with multiple imagine runs persisted. Phone's Chat tab shows "Run 1 — CEO (3 msgs, Apr 18) ▶" buttons above the current-run messages. Tap to expand; older messages render inside.
2. **New run mid-session** — in desktop, abort and restart the current imagine run. Phone's tail clears and a new "Run N" button appears at the top of the archived list.
3. **Phase transition** — advance from imagine to warroom on either surface. Phone's chat tab replaces imagine's runs with warroom's runs (zero archived runs on first entry); tail shows only the new phase's live messages.
4. **Uncapped tail** — send 100+ chat messages in a single run. Phone renders all of them (scroll up to reach the top of the tail).

Pass all four → sub-project 3b done.

### Not tested

- Virtualization / scroll performance at the extreme tail (thousands of messages).
- Large archived payloads over the relay transport (bandwidth; covered by manual QA eyeballing).

## Implementation Order (preview for writing-plans)

Eight tasks. Each small.

1. **Move `ArchivedRun` to `shared/types/session.ts`.** Update desktop `chat.store.ts` import. Extend `SessionSnapshot` with `archivedRuns?`. Extend `SessionStatePatch` with the new variant.
2. **Add `computeArchivedRuns` to `ChatHistoryStore`.** TDD with the 4 new cases.
3. **Update `SnapshotBuilder`** — field, setter, getSnapshot, applyStatePatch case, reset, uncap. TDD with 5 new cases.
4. **Update `EventForwarder`** — `onArchivedRuns` hook; `MobileBridge` facade exposes it. 1 new test.
5. **Update mobile session store** — handle the patch, drop the cap. TDD with 3 new cases.
6. **Create `ArchivedRunsList` component** + 4 tests + CSS.
7. **Wire `ChatView.tsx`** — prepend `<ArchivedRunsList>`, update empty-state condition. Extend tests with 2 new cases.
8. **Wire desktop triggers** — `setCurrentChatPhase` / `setCurrentChatRunNumber` / `resetSessionState` / project-open. No new tests (covered by manual QA). Rebuild + full test + manual QA.

Writing-plans turns these into bite-sized TDD steps with complete code and commands.
