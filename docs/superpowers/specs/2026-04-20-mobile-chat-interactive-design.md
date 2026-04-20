# Mobile Chat Interactive QuestionBubble + Phase Advance — Design

**Status:** design approved, pending user review
**Target:** `electron/orchestrator/`, `electron/ipc/phase-handlers.ts`, `src/renderer/src/components/OfficeView/`, `src/mobile-renderer/`, `mobile/src/`
**Decomposition context:** sub-project 3a of 3 on the path to full mobile-chat parity with desktop. Sub-project 3b (archived runs + uncapped history) is a separate spec.

---

## Problem

Sub-project 2 landed the waiting indicator on mobile — the phone shows "Awaiting your response..." (italic) when an agent is blocked on `AskUserQuestion`, but the user can only answer from the desktop. The phone is read-only at every "user decides" moment.

Two related flows are affected:

1. **`AskUserQuestion`** — phone user sees the italic, can't tap to answer. Has to pick up the desktop.
2. **Phase transitions** — when a phase (imagine / warroom) completes, desktop renders `PhaseActionButton` ("Continue to War Room →", "Continue to Build →"). The phone has no equivalent — there's no wire for phase-advance and no UI for it.

## Goal

Phone becomes a first-class surface for "user decides" moments:

- **Interactive `QuestionBubble`** — when `snapshot.waiting` has options, render the desktop's `QuestionBubble` with `isExpanded={true}` inside the mobile Chat tab. Tapping an option sends the label back to desktop via the existing chat wire and resolves the pending question.
- **Phase-advance as a question** — when phase machine marks a phase completed, desktop also synthesizes an `AskUserQuestion` like `"Continue to War Room"`. Mobile sees it via sub-project 2's waiting signal and renders the same interactive bubble. Desktop also renders the bubble (replacing the retired `PhaseActionButton`). Answering on either surface resolves the question, which in turn advances the phase.

Unified UX: every "user decides" moment looks the same on both devices.

## Non-Goals

- **Sub-project 3b** — archived runs (collapsible older phase runs), uncapped history (remove 50-cap on `chatTail`). Separate spec.
- **Optimistic button disable on tap.** Rely on the existing chat-wire ack-timeout as the safety net; no visual "sending…" state on the interactive bubble.
- **Multi-select answers from phone.** The orchestrator doesn't currently emit `multiSelect: true` questions. Deferred.
- **Phase rollback from phone.** No UI to undo a phase advance. Desktop-side abort remains the escape hatch.
- **Synthesizing `build → complete`.** Build has no explicit advance today (it self-completes); no synthesized question.
- **New wire types.** Zero protocol additions — everything reuses sub-project 2's waiting channel and the existing `{ type: 'chat' }` upstream.

## Architecture

```
Desktop                                                       Mobile
─────────────────────────────────────────────                 ────────────────────────────
phase-machine: markCompleted('imagine')     ┐
(in handleStartImagine, line 205)            │
  ↓                                          │
runAdvanceAfterImagine() (new helper,        │
  fire-and-forget):                          │
  await handleAgentWaiting('ceo', [{         │
    question: 'Imagine complete. …?',        │
    options: [{label: 'Continue to War      ├───┐
      Room'}], …                              │   │
  }])                                         │   │ (sub-project 2 wire)
  → returns Promise<Record<string, string>>  │   │
                                             │   ▼
desktop ChatPanel sees AGENT_WAITING IPC    │  SessionSnapshot.waiting.questions[0]
  → renderQuestionBubble() draws the        │      ↓
    same QuestionBubble (with 1 option:     │  ChatView renders interactive
    'Continue to War Room')                 │   <QuestionBubble isExpanded={true}
                                             │     onSelect={label => sendAnswer(label)}/>
real AskUserQuestion (unchanged)             ┘

desktop user clicks option in QuestionBubble           phone user taps option
  ↓                                                     ↓
ChatPanel's existing handler → USER_RESPONSE IPC       sendAnswer(label) in WebView
  → resolves pendingQuestions[sessionId]                ↓ postMessage
                                                        WebViewHost: session.sendChat(label)
                                                        ↓ transport.send
                                                        desktop WsServer.onPhoneChat
                                                        ↓
                                                        routeUserChat (existing):
                                                          finds pending question,
                                                          resolves with { [question]: label }
                                                          → mobileBridge.onAgentWaiting(null)
  ↓ (either path)
runAdvanceAfterImagine's awaited promise resolves
  ↓
handleStartWarroom() fires (module-scoped;
  same code path the retired IPC triggered)
  ↓
next phase runs → eventually markCompleted('warroom')
  → runAdvanceAfterWarroom() → … → handleStartBuild()
  → build runs → markCompleted('build')
  → (no advance question; self-completes)
```

### Key design decisions

1. **Reuse desktop's `QuestionBubble` on mobile, via relative import** — same pattern sub-project 1 established for `MessageBubble`. `isExpanded={true}` on mobile so answer cards show description/tradeoffs/recommendation, which are especially useful when the user is away from the desktop. The column-flex layout in expanded mode already works on narrow viewports (no `1fr 1fr` grid).

2. **Retire `PhaseActionButton`** — the synthesized question renders as a `QuestionBubble` on desktop too. Desktop user clicks the one-option card instead of the old button. Deletes one component and the `<PhaseActionButton />` JSX line in `ChatPanel`.

3. **Synthesize the phase-advance question via existing `handleAgentWaiting`** — no new persistence, no new IPC, no new wire. It IS an `AskUserQuestion`, and the existing persistence to `.the-office/pending-question.json` (from `state.ts`) survives restart. The awaiting side is a new `runAdvanceAfterImagine` / `runAdvanceAfterWarroom` helper that fires-and-forgets from the phase-handler completion point.

4. **Chain via `handleStartWarroom` / `handleStartBuild` module-locals** — the existing IPC handlers in `phase-handlers.ts` become module-exported functions. Called programmatically by the synthesis awaiter; the IPC channels stay registered (for backward compat / tests / CLI) but the UI no longer triggers them. The existing phase machine behavior (transition, markCompleted, markFailed) is unchanged.

5. **WebView → RN host message type `sendChat`** — the WebView's interactive `QuestionBubble.onSelect` calls a new tiny `sendAnswer(label)` helper that `postMessage`s `{ type: 'sendChat', body: label }` to the RN host. The host extends its existing `onMessage` switch with a `sendChat` case that calls `session.sendChat(body)`.

6. **Extract `useSession.sendChat(body)`** — the current `useSession` exposes `submit()` which reads `draft` from component state. Refactor to factor out a `sendChat(body: string)` primitive used by both `submit()` and the new WebView-driven path. Zero behavior change to the composer.

## File Changes

### `src/renderer/src/components/OfficeView/PhaseActionButton.tsx` — delete

### `src/renderer/src/components/OfficeView/ChatPanel.tsx` — two removals

1. Remove the import `import { PhaseActionButton } from './PhaseActionButton';`.
2. Remove the `<PhaseActionButton />` JSX line (currently sits right before `<div ref={messagesEndRef} />` at line 391).

### `electron/ipc/phase-handlers.ts` — three additions

1. **Export the existing module-local handlers** so the synthesis awaiter can call them:
   ```ts
   export async function handleStartWarroom(): Promise<void> { /* existing body */ }
   export async function handleStartBuild(options: BuildStartOptions): Promise<void> { /* existing body */ }
   ```
   The `ipcMain.handle(IPC_CHANNELS.START_WARROOM, handleStartWarroom)` and `START_BUILD` registrations stay.

2. **New fire-and-forget helpers** (below the existing handlers, above the module-end):
   ```ts
   const PHASE_ADVANCE_OPTIONS = {
     imagine: {
       role: 'ceo' as AgentRole,
       question: 'Imagine phase complete. Ready to move to the War Room?',
       header: 'Continue',
       label: 'Continue to War Room',
     },
     warroom: {
       role: 'project-manager' as AgentRole,
       question: 'Plan is locked. Ready to build it?',
       header: 'Continue',
       label: 'Start Build',
     },
   } as const;

   async function runAdvanceAfter(from: 'imagine' | 'warroom'): Promise<void> {
     const spec = PHASE_ADVANCE_OPTIONS[from];
     try {
       await handleAgentWaiting(spec.role, [{
         question: spec.question,
         header: spec.header,
         options: [{ label: spec.label }],
         multiSelect: false,
       }]);
     } catch (err) {
       console.warn(`[phase-advance] ${from} synthesis rejected:`, err);
       return;  // don't advance if the question was explicitly rejected (e.g., project switch)
     }
     if (from === 'imagine') {
       await handleStartWarroom();
     } else {
       await handleStartBuild({
         modelPreset: 'default',
         retryLimit: 2,
         permissionMode: 'auto-all',
       });
     }
   }
   ```
   The build default args mirror the retired `PhaseActionButton`'s inline args.

3. **Fire the helper at the three completion sites:**
   - `phase-handlers.ts:205` (end of `handleStartImagine`, after `pm.markCompleted('imagine');`): add `void runAdvanceAfter('imagine');`.
   - `phase-handlers.ts:271` (end of `handleStartWarroom` main flow, after `phaseMachine!.markCompleted('warroom');`): add `void runAdvanceAfter('warroom');`.
   - `phase-handlers.ts:486` (end of `handleResumeWarroom`, after `phaseMachine!.markCompleted('warroom');`): add `void runAdvanceAfter('warroom');`.

### `src/mobile-renderer/ChatView.tsx` — one insert + `isWaiting` refinement

After the existing `messages.forEach` loop that builds `rendered`, append the interactive bubble when appropriate:

```tsx
const firstQuestion = waiting?.questions?.[0];
const showInteractive = !!firstQuestion && firstQuestion.options.length > 0;
if (showInteractive && waiting) {
  const accent = AGENT_COLORS[waiting.agentRole] ?? '#6366f1';
  rendered.push(
    <QuestionBubble
      key="question-bubble"
      question={firstQuestion!}
      accentColor={accent}
      isExpanded={true}
      onSelect={(label) => sendAnswer(label)}
    />,
  );
}
```

Imports added at the top:

```tsx
import { QuestionBubble } from '../renderer/src/components/OfficeView/QuestionBubble';
import { AGENT_COLORS } from '../../shared/types';
import { sendAnswer } from './sendAnswer';
```

Refine the `isWaiting` prop on the last `MessageBubble`:

```tsx
isWaiting={isLast && !!waiting && !showInteractive}
```

This suppresses the italic "Awaiting your response" line when an interactive bubble is rendering — the bubble IS the indicator. Free-text questions (options array empty) keep the italic.

### `src/mobile-renderer/sendAnswer.ts` — new

```ts
// Bridges a tap on the interactive QuestionBubble to the React Native host.
// The host's onMessage handler relays the body to `session.sendChat`, which
// sends `{ type: 'chat', v: 2, body, clientMsgId }` upstream — the existing
// answer path. Zero new wire types.
export function sendAnswer(label: string): void {
  const host = (window as unknown as {
    ReactNativeWebView?: { postMessage: (s: string) => void };
  }).ReactNativeWebView;
  if (!host) {
    console.warn('[sendAnswer] no ReactNativeWebView host — answer dropped');
    return;
  }
  host.postMessage(JSON.stringify({ type: 'sendChat', body: label }));
}
```

### `mobile/src/session/useSession.ts` — extract `sendChat`

Refactor the existing `submit` to share logic with a new public `sendChat(body: string)`:

```ts
const sendChat = useCallback((body: string): Promise<{ ok: boolean; error?: string }> => {
  const trimmed = body.trim();
  if (!trimmed || sending) return Promise.resolve({ ok: false, error: 'empty' });
  const transport = transportRef.current;
  if (!transport) return Promise.resolve({ ok: false, error: 'no transport' });
  setSending(true);
  const clientMsgId = `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  return new Promise<{ ok: boolean; error?: string }>((resolve) => {
    const timer = setTimeout(() => {
      pendingAcksRef.current.delete(clientMsgId);
      setSending(false);
      resolve({ ok: false, error: 'Timed out waiting for acknowledgment' });
    }, 5000);
    pendingAcksRef.current.set(clientMsgId, {
      resolve: (result) => {
        setSending(false);
        resolve(result);
      },
      timer,
    });
    transport.send({ type: 'chat', v: 2, body: trimmed, clientMsgId });
  });
}, [sending]);

const submit = (): Promise<{ ok: boolean; error?: string }> => {
  return sendChat(draft).then((result) => {
    if (result.ok) setDraft('');
    return result;
  });
};
```

Expose `sendChat` on the return object:

```ts
return { status, draft, setDraft, sending, canSend, submit, sendChat };
```

All existing consumers of `submit` / `status` / `draft` / `setDraft` continue to work.

### `mobile/src/webview-host/WebViewHost.tsx` — accept `sendChat` prop, one case in `onMessage`

`useSession` is called in `SessionScreen.tsx` (the parent of `WebViewHost`), not in `WebViewHost` itself. Calling `useSession` inside `WebViewHost` would instantiate a second hook with its own transport — wrong. Pass `sendChat` down as a prop.

Add to the props interface:

```tsx
interface Props {
  // …existing props, if any…
  onPhoneAnswer: (body: string) => Promise<{ ok: boolean; error?: string }>;
}

export function WebViewHost({ onPhoneAnswer }: Props) {
  // …existing body…
}
```

Extend the existing `onMessage` handler with a new case after the `ready` case:

```tsx
if (data?.type === 'sendChat' && typeof data.body === 'string') {
  void onPhoneAnswer(data.body).then((result) => {
    if (!result.ok) console.warn('[WebViewHost] sendChat failed', result.error);
  });
  return;
}
```

### `mobile/src/session/SessionScreen.tsx` — thread `sendChat` into `WebViewHost`

After `const session = useSession({ device, onPairingLost });`, pass `session.sendChat` to the rendered `<WebViewHost />`:

```tsx
<WebViewHost onPhoneAnswer={session.sendChat} />
```

Single line, no other change.

### No other files change

- `shared/types/` — no type additions.
- `shared/protocol/mobile.ts` — no message types added.
- `electron/mobile-bridge/` — no changes. Existing `routeUserChat` already resolves pending questions.
- `electron/ipc/state.ts` — no changes beyond what sub-project 2 added.

## Edge Cases

**Phone answers while desktop is typing.** `routeUserChat` uses the first pending question in the map; whichever arrives first resolves it. The losing side's input clears naturally when `snapshot.waiting` flips to null.

**Double-tap on the phone.** Buttons are not disabled after tap. Second tap produces a second `{ type: 'chat' }` upstream. The first one resolves the question (via `pendingQuestions.delete` + `pending.resolve`). The second one falls through `routeUserChat`'s pending-question loop (no match, since deleted), then hits `handleSendMessage` or the "nothing running" branch, producing a regular chat message. No state corruption — the second tap becomes a "I meant to say X" message.

**Tap during network glitch.** The `sendChat` promise returns `{ok: false, error: 'Timed out'}` after 5 seconds. The bubble stays visible because `snapshot.waiting` hasn't cleared. User can retry by tapping again; the first message may arrive late but the second also attempts to resolve (same pending question, same resolve — first wins, second no-ops).

**Reconnect mid-question.** Sub-project 2's snapshot-carried `waiting` field already handles this. The interactive bubble renders from the re-synced snapshot on first paint. No new work.

**Project switch during synthesis.** `rejectPendingQuestions('Project switch')` is already called at project boundaries. The `runAdvanceAfter` helper catches the rejection and returns — no phase advance fires. Correct behavior.

**Desktop abort during synthesis.** The existing `rejectPendingQuestions` path also fires on abort. Same catch branch; no advance.

**User types the option label in desktop chat.** `routeUserChat` already matches by body — typing "Continue to War Room" (exact) into the desktop composer resolves the question and advances the phase. Useful fallback; requires no new code.

**Multi-select phase-advance questions.** Not possible by construction — the synthesized question has one option and `multiSelect: false`. The `QuestionBubble` renders it as one card.

**Phase machine in an unexpected state when synthesis resolves.** `handleStartWarroom` calls `phaseMachine!.transition('warroom')` as its first step. `transition` validates the requested phase against the current phase; if invalid, it throws. `runAdvanceAfter` catches exceptions (the outer try/catch), logs, and returns. Phase advance silently fails rather than corrupting state — arguably wrong for end-user UX but correct for safety. Mitigation: the user can retry from desktop via abort+restart; rare in practice.

**Warroom resume path (phase-handlers.ts:486).** This path is triggered when the user returns to a project mid-warroom (via `handleResumeWarroom`). The original flow synthesizes the advance question at the end, identical to the main path. Same `runAdvanceAfter('warroom')` call.

**Restart mid-advance-question.** `handleAgentWaiting` persists the question to `.the-office/pending-question.json` via `persistWaitingState`. On restart, `loadWaitingState` reads it back, and the existing session-load path creates a fresh `pendingQuestions` entry. BUT: the awaiter (`runAdvanceAfter`) is not restarted. The phone sees the question on reconnect; tapping resolves it; but no awaiter = no phase advance.

Mitigation: on session load, after restoring the pending question, if its content matches a phase-advance signature (question text match to the `PHASE_ADVANCE_OPTIONS` entries), re-register the awaiter. Small addition to `loadWaitingState` consumers. Include a single helper `tryReregisterPhaseAdvanceAwaiter(payload)` called from wherever the session-restore hook lives (likely `electron/main.ts` or similar).

## Testing Strategy

### Automated (vitest)

**`src/mobile-renderer/__tests__/ChatView.test.tsx`** — extend with 3 new cases:

1. Renders `QuestionBubble` when `snapshot.waiting` has options.
2. Last-bubble `isWaiting` is `false` when interactive bubble renders (italic suppressed).
3. Last-bubble `isWaiting` stays `true` when `waiting.questions` is empty or no-options (italic still shown for free-text questions).

**`src/mobile-renderer/__tests__/sendAnswer.test.ts`** — new, 2 cases:

1. `sendAnswer('Label')` posts `{type:'sendChat', body:'Label'}` to `ReactNativeWebView`.
2. No host → warns, doesn't throw.

**`tests/electron/orchestrator/phase-advance.test.ts`** — new, 3 cases:

1. Calling `runAdvanceAfter('imagine')` triggers `handleAgentWaiting` with the expected question shape. (Mock `handleAgentWaiting` and `handleStartWarroom`; assert call args; resolve the promise; assert `handleStartWarroom` is called.)
2. Same for `warroom` → `handleStartBuild` with the default build args.
3. `handleAgentWaiting` rejection → `handleStartWarroom` NOT called (project-switch simulation).

**`mobile/src/session/__tests__/useSession.test.ts`** (if absent, create) — 1 new case:

1. `sendChat('hello')` sends `{type:'chat', body:'hello', clientMsgId:…}` via the transport mock, resolves on ack. (If `submit`-specific tests exist today, adapt them to exercise `sendChat` as the primitive.)

### Manual QA (5 scenarios)

1. **Phone answers a real question.** Desktop agent emits `AskUserQuestion` with 2+ options. Phone shows expanded `QuestionBubble`. Tap an option — chat log on both surfaces records the tap as a user message with the 📱 Mobile badge. Agent resumes.
2. **Desktop answers same question.** Repeat scenario 1 but click on desktop. Phone's bubble disappears.
3. **Phase advance from phone.** Complete an `imagine` phase. Phone shows 1-option bubble "Continue to War Room". Tap. War Room begins. Phone's bubble disappears.
4. **Phase advance from desktop.** Same setup. Click the card on desktop. War Room begins. Phone's bubble disappears.
5. **Phase advance via typed text.** Same setup. Type "Continue to War Room" in desktop composer. Question resolves. War Room begins.

Pass all five → sub-project 3a done.

### Not tested

- Pixel parity between desktop and mobile rendering of `QuestionBubble` (they share the component, but `isExpanded={true}` produces slightly different layouts depending on container width).
- Concurrent desktop+phone taps with timing near-simultaneous — theoretically one wins due to event loop ordering; manual QA would need a controlled environment to reliably reproduce.
- Session restart mid-advance-question with phone reconnecting (covered by the mitigation note; QA via simulating a desktop restart).

## Implementation Order (preview for writing-plans)

Seven tasks. Each small.

1. **Extract `useSession.sendChat(body)`** — refactor `submit` to delegate. Expose on hook return. Add `useSession.test.ts` case for `sendChat`. Existing tests keep passing.
2. **Add WebView→host `sendChat` bridge** — new `src/mobile-renderer/sendAnswer.ts` + unit test. Extend `WebViewHost.onMessage` with `sendChat` case.
3. **Wire interactive QuestionBubble into ChatView** — import, conditional push, `isWaiting` refinement. 3 new vitest cases.
4. **Export `handleStartWarroom` / `handleStartBuild` from phase-handlers.ts** — visibility change only. IPC registrations unchanged. Run full test suite.
5. **Add `runAdvanceAfter(from)` helper + fire at 3 completion sites** — `PHASE_ADVANCE_OPTIONS` const, helper function, `void runAdvanceAfter('imagine')` at line 205, `void runAdvanceAfter('warroom')` at lines 271 and 486. New `tests/electron/orchestrator/phase-advance.test.ts`.
6. **Retire PhaseActionButton** — delete the file and remove the reference in `ChatPanel.tsx`. Confirm desktop still renders the synthesized question as a `QuestionBubble` when a phase completes (manual smoke).
7. **Rebuild mobile bundle + full vitest + 5-item manual QA.**

Writing-plans turns these into bite-sized TDD steps with complete code and commands.
