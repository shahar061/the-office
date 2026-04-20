# Mobile Chat Live Context Signals — Design

**Status:** design approved, pending user review
**Target:** `src/mobile-renderer/` (WebView bundle) + `electron/mobile-bridge/` + `shared/types/`
**Decomposition context:** sub-project 2 of 3 on the path to full mobile-chat parity with desktop. Sub-project 1 (styling parity) shipped `2026-04-19`. Sub-project 3 will add interactive `QuestionBubble`, interactive `PhaseActionButton`, archived runs, and uncapped history. Each is its own spec + plan.

---

## Problem

Sub-project 1 brought mobile chat's bubble styling to parity with desktop. But the chat tab is still missing three live context signals that desktop has:

1. **Waiting indicator.** When an agent calls `AskUserQuestion`, desktop renders "Awaiting your response..." in italic under the last bubble. Mobile shows nothing — the conversation just stops with no cue that the agent is blocked on the user.
2. **Activity indicator.** When an agent runs a tool (Read/Write/Edit/Bash/Grep/…), desktop renders an `ActivityIndicator` under the composer with the tool name and target (e.g. "Engineer: Read foo.ts"). Mobile has no activity surface at all.
3. **Phase transitions.** When the project transitions between phases (idle → imagine → warroom → build → complete), desktop surfaces this via `PhaseActionButton` at the end of the chat. Mobile shows the current phase on the snapshot but no history — a user who was scrolled up in the conversation has no way to see that a transition happened mid-chat.

Today mobile has the raw data for (2) — `agent:tool:start`/`done` events are on the wire — but `SnapshotBuilder.ingestEvent` discards tool metadata via `classifyActivity` before it reaches the mobile client. Waiting (1) has no wire path at all. Phase transitions (3) have wire data (`snapshot.phase` + the `phase` patch) but no history.

## Goal

Mobile shows all three signals with desktop-equivalent context:

- **Waiting** — italic "Awaiting your response..." line under the last bubble in the Chat tab.
- **Activity** — footer strip above the tab bar in the Chat tab ("Engineer is reading foo.ts"), plus a text label above the character sprite in the Office tab.
- **Phase transitions** — read-only separator interleaved between chat bubbles where the phase changed.

## Non-Goals

- **Interactive `QuestionBubble`** — tap to answer from the phone. Sub-project 3.
- **Interactive `PhaseActionButton`** — tap to acknowledge/advance a phase. Sub-project 3.
- **Archived runs** collapsible sections. Sub-project 3.
- **Uncapped full-history sync.** Sub-project 3. The 50-message `chatTail` cap stays.
- **Activity indicator richness.** Just `{ toolName, target? }`. No args preview, no duration, no per-action history (desktop's `ActivityIndicator` has a small timeline; mobile's footer shows just the current action).
- **Per-character activity on Chat tab.** If multiple characters are concurrently active, the Chat footer shows the first one; the Office tab shows all.

## Architecture

All three signals flow through the existing `mobile-bridge` relay. No new transport, no new message types at the WebSocket layer. Three field additions to existing snapshot types, one new `SessionStatePatch` variant, three builder logic changes.

```
Desktop (main process)         mobile-bridge                 Mobile (WebView)
─────────────────────────      ──────────────────────        ─────────────────────────
agent waits (IPC)         ──▶  EventForwarder.onWaiting      SessionSnapshot.waiting
                               → setWaiting()                ──▶ MessageBubble isWaiting prop
                               emits {kind:'waiting'} patch      on last bubble

agent:tool:start/done     ──▶  SnapshotBuilder.ingestEvent   CharacterSnapshot.currentTool
(already on wire)              preserves {toolName,target}   ──▶ Chat: <ActivityFooter/>
                               via extractToolTarget              above the tab bar
                                                             ──▶ Office: text label above
                                                                  character sprite

phase change              ──▶  SnapshotBuilder.ingestChat    ChatMessage.phase
(already on wire)              stamps msg.phase=current      ──▶ renderer interleaves a
                                                                  separator wherever
                                                                  prev.phase !== curr.phase
```

### Why these shapes

**Waiting as snapshot state, not an event stream.** Waiting is inherently a single-value, idempotent state (one question at a time). Modelling it as a `SessionSnapshot.waiting?` field means reconnect mid-wait replays current truth by construction — no event-replay, no "did the phone miss the start?" question. The `{ kind: 'waiting' }` patch variant is the plumbing for incremental updates to that field.

**Activity via preserved tool metadata, not a new patch kind.** The wire already carries `AgentEvent.message` with enough context for `extractToolTarget` to produce "foo.ts" / "grep pattern" / etc. The gap is purely that `SnapshotBuilder` drops this when classifying into `CharacterActivity`. Preserving `{ toolName, target? }` on `CharacterSnapshot` fixes the leak without adding a protocol.

**Phase tagged per-message, not a separate history.** The phase-at-send-time is part of a message's context. Tagging each appended message with the current phase (a) keeps phase history aligned with chat content by construction, (b) needs no timestamp-interleave logic, (c) survives reconnect (persisted on `chatTail`).

### Reuse from desktop

- **`MessageBubble`** already accepts an `isWaiting` prop that renders the italic "Awaiting your response..." line. Mobile's `ChatView` imports it (relative path, same pattern as sub-project 1) and sets `isWaiting={true}` on the last bubble when `snapshot.waiting` is set.
- **`extractToolTarget`** in `src/renderer/src/utils.ts` — mobile imports it via the same relative pattern. Takes an `AgentEvent`, returns a short display string (filename for Read/Write/Edit, truncated command for Bash, etc.).
- **`agentDisplayName`** in `src/renderer/src/utils.ts` — already used by sub-project 1's `MessageBubble`. Reused in `ActivityFooter` for "Engineer is reading…".
- **Desktop's `PhaseActionButton`** — **not** imported. Its button-at-the-end-of-list behaviour is the desktop surface for phase transitions, but the interactive part is sub-project 3. Mobile gets a new `PhaseSeparator` component with static rendering only.

## File Changes

### `shared/types/session.ts` — three additions

```ts
export interface CharacterSnapshot {
  agentId: string;
  agentRole: AgentRole;
  activity: CharacterActivity;
  currentTool?: { toolName: string; target?: string };   // NEW
}

export interface ChatMessage {
  // ...existing fields...
  phase?: Phase;   // NEW — stamped at append time by SnapshotBuilder
}

export interface SessionSnapshot {
  // ...existing fields...
  waiting?: AgentWaitingPayload;   // NEW — nullable, single-value
}

export type SessionStatePatch =
  | { kind: 'phase'; phase: Phase }
  | { kind: 'activeAgent'; agentId: string | null }
  | { kind: 'ended'; ended: boolean }
  | { kind: 'waiting'; payload: AgentWaitingPayload | null };   // NEW
```

All additions are optional / nullable — old snapshots deserialize forward-compatibly.

### `electron/mobile-bridge/snapshot-builder.ts` — three logic changes

1. **Preserve tool metadata on `currentTool`.** Replace the current `ingestEvent` body so that after `classifyActivity` runs, on `agent:tool:start` we also set `c.currentTool = { toolName: event.toolName ?? 'Tool', target: extractToolTarget(event) }`, and on `agent:tool:done` / `agent:tool:clear` / `agent:closed` we clear it.

2. **Stamp `phase` on appended chat.** In `ingestChat`, map each incoming message to `{ ...m, phase: m.phase ?? this.phase }` before appending. The `m.phase ?? this.phase` preserves upstream tagging if any layer ever does it; otherwise stamps current phase at ingest time.

3. **New `setWaiting(payload: AgentWaitingPayload | null)` method.** Sets `this.waiting = payload`. Export via snapshot.

Also: extend `applyStatePatch` with the new `{ kind: 'waiting' }` case.

Also: extend `reset()` to clear `this.waiting = undefined`.

### `electron/mobile-bridge/event-forwarder.ts` — one new hook

Add `onAgentWaiting = (payload: AgentWaitingPayload | null): void` that calls `snapshots.setWaiting(payload)` and broadcasts `{ type: 'state', v: 2, patch: { kind: 'waiting', payload } }`. Mirrors the shape of `onStatePatch`.

### `electron/ipc/state.ts` — wire the desktop-side waiting signal through

`handleAgentWaiting` currently creates the pending-question promise and sends `AGENT_WAITING` to the desktop renderer. It does **not** currently notify the mobile bridge. Add a call to `eventForwarder.onAgentWaiting(payload)` at the same site, and a paired `eventForwarder.onAgentWaiting(null)` at the resume/answer site (wherever the promise is resolved and desktop's waiting state clears).

### `shared/stores/session.store.ts` — one reducer addition

Add the `{ kind: 'waiting' }` case to `applyStatePatch`. Sets `snapshot.waiting = payload` (or deletes the key if `payload === null`).

### `src/mobile-renderer/ChatView.tsx` — three inserts

Replaces the current single-map render with:

```tsx
export function ChatView(): React.JSX.Element {
  const snapshot = useSessionStore((s) => s.snapshot);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [snapshot?.chatTail.length, snapshot?.waiting]);

  const messages = snapshot?.chatTail ?? [];
  const waiting = snapshot?.waiting ?? null;

  if (messages.length === 0 && !waiting) {
    return <div className="chat-empty">No messages yet.</div>;
  }

  const rendered: React.ReactNode[] = [];
  let prevPhase: Phase | undefined;
  messages.forEach((m, i) => {
    if (m.phase && m.phase !== prevPhase && prevPhase !== undefined) {
      rendered.push(<PhaseSeparator key={`sep-${m.id}`} phase={m.phase} />);
    }
    prevPhase = m.phase ?? prevPhase;
    const isLast = i === messages.length - 1;
    rendered.push(
      <MessageBubble key={m.id} msg={m} isWaiting={isLast && !!waiting} />
    );
  });

  return (
    <>
      <div className="chat-list" ref={listRef}>{rendered}</div>
      <ActivityFooter />
    </>
  );
}
```

Note: `prevPhase !== undefined` in the check — we don't want a separator above the very first message.

### `src/mobile-renderer/PhaseSeparator.tsx` — new component

Small, static. Centered horizontal rule with the phase name in the middle:

```tsx
export function PhaseSeparator({ phase }: { phase: Phase }): React.JSX.Element {
  return (
    <div className="phase-separator">
      <span className="phase-separator-line" />
      <span className="phase-separator-label">{phaseDisplayName(phase)}</span>
      <span className="phase-separator-line" />
    </div>
  );
}
```

`phaseDisplayName` maps `'imagine' → 'Imagine'`, etc. Lives in this file (one-line helper).

### `src/mobile-renderer/ActivityFooter.tsx` — new component

```tsx
export function ActivityFooter(): React.JSX.Element | null {
  const characters = useSessionStore((s) => s.snapshot?.characters ?? []);
  const active = characters.find((c) => c.currentTool);
  if (!active) return null;

  const verb = toolVerb(active.currentTool!.toolName);
  const target = active.currentTool!.target;
  return (
    <div className="activity-footer">
      <span className="activity-dot" />
      <span className="activity-text">
        {agentDisplayName(active.agentRole)} is {verb}
        {target ? ` ${target}` : ''}…
      </span>
    </div>
  );
}
```

`toolVerb` maps tool names to gerunds:

- `Read`, `Grep`, `Glob`, `WebFetch`, `WebSearch` → `"reading"`
- `Write`, `Edit` → `"writing"`
- `Bash` → `"running"`
- `Agent` → `"delegating"`
- anything else → `"running"`

Lives in `src/mobile-renderer/activityVerb.ts` so it's unit-testable in isolation.

### `src/mobile-renderer/MobileScene.ts` — character label overlay

The Office tab is a pure Pixi canvas rendered by `MobileScene`, with characters in a `characterLayer` (`Container`). Labels are Pixi `Text` objects attached to the same layer, positioned at each character's pixel coords (read via `character.getPixelPosition()`) minus a fixed vertical offset (~16px above the sprite's top edge).

Add a private `Map<string, Text>` (`agentId → label`) to `MobileScene`. In the existing per-frame sync loop (`applyCharacterStates` or equivalent — the one reading `useSessionStore.getState().characterStates`), also read `useSessionStore.getState().snapshot?.characters` and for each character with `currentTool` set:

1. Create or update a `Text` with content `${emoji} ${target ?? ''}` (trimmed).
2. Position it at the character's pixel coords + `(0, -16)`.
3. If the character has no `currentTool`, destroy and remove its label.

Use PixiJS `Text` with a small font (11-12px), white fill, and a 1px black drop shadow for legibility over any background.

Label format: `{emoji} {target?}` where emoji maps from tool name (same dictionary as `toolVerb`):

- Read / Grep / Glob / WebFetch / WebSearch → 📖
- Write / Edit → ✏️
- Bash → ⚡
- Agent → 🤝
- anything else → 🔧

Hidden when `currentTool` is undefined.

### `src/mobile-renderer/style.css` — append three rule blocks

- `.phase-separator` — flex row, gap, small uppercase label, dim lines on either side.
- `.activity-footer` — absolute bottom, above tab bar (`bottom: calc(var(--tab-bar-height) + env(safe-area-inset-bottom))`), ~32px tall, dim background, flex row with dot + text.
- `.activity-dot` — pulsing colored dot (matches desktop's `ActivityIndicator` visual).

Concrete CSS is in the implementation plan.

### No other files change

- `MobileApp.tsx` — already renders `<ChatView />`.
- `vite.config.mobile.ts` — no alias changes.
- Root `package.json` — no new deps.

## Edge Cases

**Reconnect mid-wait.** `SessionSnapshot.waiting` is snapshot state, so initial sync after reconnect carries it. No event-replay needed.

**Reconnect mid-tool.** `CharacterSnapshot.currentTool` is snapshot state; initial sync carries it. If the tool:done happens during the reconnect gap, the client sees stale `currentTool` until the next relevant event — acceptable; clears on next activity.

**Rapid tool start/done.** Builder processes events in order; UI re-renders from snapshot. Brief flashes possible, no stuck state.

**Multiple concurrent tools on one character.** Last `tool:start` wins on `currentTool`. `tool:done` with a matching `toolId` clears it; a `tool:done` for a prior tool after a later `tool:start` also clears it (acceptable — conservative, prevents stuck indicators).

**Multiple concurrent active characters.** Chat footer shows the first with `currentTool` set (stable selection). Office tab shows labels on all. Rationale: Chat is single-threaded narrative context; Office is spatial — showing all there matches how users read each surface.

**Phase transition with no chat messages in the interim.** No separator (nothing to interleave between). The next message carries the new phase tag, and the separator appears above it. If the next message never arrives in this phase, the transition is invisible in Chat — matches desktop's "transitions are shown at the boundary of messages" model.

**Phase transition at the very first message of a run.** No separator (we skip if `prevPhase === undefined`). User sees the phase context via the `PhaseActionButton` in sub-project 3; for now, the first message just appears.

**Waiting payload with empty `questions` array.** Renders "Awaiting your response..." italic line (no interactive bubble — sub-project 3). MessageBubble's existing `isWaiting` handling already renders the italic line regardless of payload content.

**Empty `chatTail` + active waiting.** Today the empty-state branch returns early. Updated check: `if (messages.length === 0 && !waiting) return empty-state`. If waiting without any messages, render an empty list + ActivityFooter and let the next message include the italic hint. Rare; acceptable.

**Tool whose `message` field is absent.** `extractToolTarget` falls back to tool name. Footer renders "Engineer is running…" without a target. Fine.

**`AskUserQuestion` tool events.** Desktop explicitly filters these from `ActivityIndicator` (they're the mechanism behind waiting, not a visible activity). Mobile's `ingestEvent` should do the same — skip `currentTool` population when `event.toolName === 'AskUserQuestion'`.

## Testing Strategy

### Automated (vitest, `electron/mobile-bridge/__tests__/snapshot-builder.test.ts`)

Extend the existing suite with:

1. `setWaiting(payload)` sets snapshot.waiting; `setWaiting(null)` clears it.
2. `agent:tool:start` populates `characters[agentId].currentTool = { toolName, target }`.
3. `agent:tool:done` clears `currentTool` on the character.
4. `agent:tool:start` with `toolName === 'AskUserQuestion'` does **not** populate `currentTool`.
5. `ingestChat` stamps each message's `phase` from the current `snapshot.phase`.
6. `applyStatePatch({ kind: 'waiting', payload: null })` clears snapshot.waiting.
7. `reset()` clears waiting.

### Automated (jest, `src/mobile-renderer/__tests__/`)

Extend `ChatView.test.tsx` and add two new suites:

1. **`ChatView.test.tsx` — extended:**
   - Renders empty state when no messages AND no waiting.
   - Renders `PhaseSeparator` between two messages with different `phase`.
   - Does NOT render a separator before the first message even if it has a phase.
   - Passes `isWaiting={true}` to the last `MessageBubble` when `snapshot.waiting` is set.
   - Passes `isWaiting={false}` to earlier bubbles.

2. **`ActivityFooter.test.tsx` — new:**
   - Hidden when no character has `currentTool`.
   - Shows first active character's tool when set.
   - Updates verb when tool changes.
   - Renders without target if target is absent.

3. **`activityVerb.test.ts` — new:**
   - Maps known tools (Read/Write/Edit/Bash/Grep/Agent) to the expected verb.
   - Falls back to `"running"` for unknown tools.

### Manual QA (end-of-implementation gate)

1. **Waiting appears.** Trigger a question from desktop → mobile shows italic "Awaiting your response..." under the last bubble.
2. **Waiting clears.** User answers → italic line disappears.
3. **Activity appears in Chat footer.** Agent runs `Read foo.ts` → footer shows "Engineer is reading foo.ts".
4. **Activity appears in Office.** Same event → label "📖 foo.ts" above the character sprite.
5. **Activity clears.** `tool:done` → both indicators clear.
6. **Phase separator.** Trigger a phase transition mid-conversation → separator appears between the bubbles bracketing the transition.
7. **Reconnect mid-wait.** Disconnect phone, trigger question on desktop, reconnect phone → waiting line appears immediately from snapshot.

Pass all seven → sub-project 2 done.

### Not tested

- Cross-device WebView quirks (Android vs iOS Safari vs WKWebView).
- Pixel-parity with desktop.
- Performance under heavy tool event churn.

## Implementation Order (preview for writing-plans)

Nine tasks. Each small.

1. **Extend types** — add `currentTool`, `phase` on message, `waiting`, `{ kind: 'waiting' }` patch to `shared/types/session.ts`.
2. **Update `SnapshotBuilder`** — preserve tool metadata, stamp phase, add `setWaiting`, extend `applyStatePatch` + `reset`. Red/green tests.
3. **Update `EventForwarder`** — add `onAgentWaiting`. Red/green test (mock broadcaster, assert patch payload).
4. **Wire desktop → bridge** — call `eventForwarder.onAgentWaiting` from `electron/ipc/state.ts` at waiting start and clear sites.
5. **Update mobile session store** — handle `{ kind: 'waiting' }` patch in `applyStatePatch`. Test.
6. **Add `PhaseSeparator` + `ActivityFooter` + `activityVerb`** — new components + util. Unit-test.
7. **Refactor `ChatView.tsx`** — interleave separators, thread `isWaiting` to last bubble, mount `ActivityFooter`. Extend existing tests.
8. **Add Office character label** — extend `MobileScene` with a `Map<string, Text>` driven off `snapshot.characters[].currentTool`, positioned above each character sprite. Manual QA.
9. **Rebuild + manual QA** — `npm run build:mobile-all`; run the 7-item QA checklist. Commit.

Writing-plans turns these into bite-sized TDD steps with complete code and commands.
