# Mobile Chat Interactive QuestionBubble + Phase Advance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the mobile companion a first-class surface for every "user decides" moment — interactive `QuestionBubble` for `AskUserQuestion`, and phase-advance reframed as a synthesized `AskUserQuestion` so desktop and mobile share one UX. Retires `PhaseActionButton`.

**Architecture:** Zero new wire types. Reuses sub-project 2's waiting-snapshot channel downstream and the existing `{ type: 'chat', v: 2, body, clientMsgId }` upstream. Phone `QuestionBubble` tap → `sendAnswer(label)` → WebView `postMessage` → `WebViewHost` prop → `useSession.sendChat(body)` → desktop `routeUserChat` resolves pending question. Phase-advance synthesized via new `runAdvanceAfter` helper in `phase-handlers.ts` which calls existing `handleAgentWaiting` then dispatches to the (now module-exported) `handleStartWarroom` / `handleStartBuild`.

**Tech Stack:** TypeScript, React 19, Zustand, vitest + @testing-library/react + jsdom (shared + WebView), jest + jest-expo + @testing-library/react-native (RN host).

---

## File Changes (preview)

Created:
- `src/mobile-renderer/sendAnswer.ts`
- `src/mobile-renderer/__tests__/sendAnswer.test.ts`
- `tests/electron/orchestrator/phase-advance.test.ts`

Modified:
- `mobile/src/session/useSession.ts` (extract `sendChat`; expose on hook return)
- `mobile/src/__tests__/useSession.test.ts` (new case for `sendChat`)
- `mobile/src/webview-host/WebViewHost.tsx` (accept `onPhoneAnswer` prop; new `sendChat` case in `onMessage`)
- `mobile/src/session/SessionScreen.tsx` (thread `session.sendChat` into `<WebViewHost />`)
- `src/mobile-renderer/ChatView.tsx` (interactive `QuestionBubble` + `isWaiting` refinement)
- `src/mobile-renderer/__tests__/ChatView.test.tsx` (3 new cases)
- `electron/ipc/phase-handlers.ts` (export `handleStartWarroom`, `handleStartBuild`; add `runAdvanceAfter` + three call sites; add restart re-register)
- `src/renderer/src/components/OfficeView/ChatPanel.tsx` (remove `PhaseActionButton` import + JSX)

Deleted:
- `src/renderer/src/components/OfficeView/PhaseActionButton.tsx`

---

## Task 1: Extract `useSession.sendChat(body)`

**Files:**
- Modify: `mobile/src/session/useSession.ts`
- Modify: `mobile/src/__tests__/useSession.test.ts`

Today `useSession.submit()` sends the current `draft` state. Factor out a `sendChat(body: string)` primitive that `submit` delegates to; expose `sendChat` on the hook return so `WebViewHost` can call it with an arbitrary label.

- [ ] **Step 1: Add new failing test**

Open `mobile/src/__tests__/useSession.test.ts`. Append this case inside the existing `describe('useSession', …)` block, just before the closing `});`:

```ts
  it('sendChat resolves ok=true when a matching chatAck arrives', async () => {
    jest.useFakeTimers();
    const fake = makeFakeTransport();
    (createTransportForDevice as jest.Mock).mockReturnValue(fake);
    const { result } = renderHook(() => useSession({ device, onPairingLost: jest.fn() }));
    act(() => useConnectionStore.getState().setStatus({ state: 'connected', desktopName: 'x' }));
    let ackPromise!: Promise<{ ok: boolean; error?: string }>;
    act(() => { ackPromise = result.current.sendChat('Option A'); });
    const sent = fake.sent.find((m: any) => m.type === 'chat') as any;
    expect(sent?.body).toBe('Option A');
    act(() => fake.emitMessage({ type: 'chatAck', v: 2, clientMsgId: sent.clientMsgId, ok: true }));
    await expect(ackPromise).resolves.toEqual({ ok: true });
    jest.useRealTimers();
  });

  it('sendChat does NOT clear draft on success (only submit does)', async () => {
    const fake = makeFakeTransport();
    (createTransportForDevice as jest.Mock).mockReturnValue(fake);
    const { result } = renderHook(() => useSession({ device, onPairingLost: jest.fn() }));
    act(() => useConnectionStore.getState().setStatus({ state: 'connected', desktopName: 'x' }));
    act(() => result.current.setDraft('something the user typed'));
    act(() => { void result.current.sendChat('Option A'); });
    expect(result.current.draft).toBe('something the user typed');
  });
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `cd mobile && npx jest src/__tests__/useSession.test.ts -t "sendChat"`
Expected: FAIL — `TypeError: result.current.sendChat is not a function` (hook doesn't expose it yet).

- [ ] **Step 3: Refactor `useSession` to extract `sendChat`**

Open `mobile/src/session/useSession.ts`. Locate the existing `submit` function (starts at line 122). Replace the existing `submit` definition with this pair of functions:

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

If `useCallback` isn't already imported, add it to the React import line at the top:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
```

Then update the hook's return statement (currently at line 150) from:

```ts
  return { status, draft, setDraft, sending, canSend, submit };
```

to:

```ts
  return { status, draft, setDraft, sending, canSend, submit, sendChat };
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd mobile && npx jest src/__tests__/useSession.test.ts`
Expected: PASS — all existing `submit` tests plus the two new `sendChat` tests.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/session/useSession.ts mobile/src/__tests__/useSession.test.ts
git commit -m "feat(useSession): extract sendChat primitive, expose on hook return"
```

---

## Task 2: WebView→host `sendChat` bridge (`sendAnswer.ts` + WebViewHost prop)

**Files:**
- Create: `src/mobile-renderer/sendAnswer.ts`
- Create: `src/mobile-renderer/__tests__/sendAnswer.test.ts`
- Modify: `mobile/src/webview-host/WebViewHost.tsx`
- Modify: `mobile/src/session/SessionScreen.tsx`

`sendAnswer(label)` posts a `{ type: 'sendChat', body: label }` message from the WebView to the RN host. The host's existing `onMessage` switch gains a case that calls the `onPhoneAnswer` prop (`session.sendChat` threaded from `SessionScreen`).

### WebView side

- [ ] **Step 1: Write failing test for `sendAnswer`**

Create `src/mobile-renderer/__tests__/sendAnswer.test.ts`:

```ts
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { sendAnswer } from '../sendAnswer';

const originalHost = (globalThis as any).window?.ReactNativeWebView;

afterEach(() => {
  (globalThis as any).window.ReactNativeWebView = originalHost;
  vi.restoreAllMocks();
});

describe('sendAnswer', () => {
  it('posts a sendChat message to the RN host with the label body', () => {
    const postMessage = vi.fn();
    (globalThis as any).window.ReactNativeWebView = { postMessage };
    sendAnswer('Continue to War Room');
    expect(postMessage).toHaveBeenCalledWith(
      JSON.stringify({ type: 'sendChat', body: 'Continue to War Room' }),
    );
  });

  it('warns but does not throw when no RN host is present', () => {
    delete (globalThis as any).window.ReactNativeWebView;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => sendAnswer('x')).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[sendAnswer]'));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/mobile-renderer/__tests__/sendAnswer.test.ts`
Expected: FAIL — "Cannot find module '../sendAnswer'".

- [ ] **Step 3: Implement `sendAnswer.ts`**

Create `src/mobile-renderer/sendAnswer.ts`:

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

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/mobile-renderer/__tests__/sendAnswer.test.ts`
Expected: PASS — 2 tests.

### RN-host side

- [ ] **Step 5: Add `onPhoneAnswer` prop to `WebViewHost`**

Open `mobile/src/webview-host/WebViewHost.tsx`. The current `WebViewHost` has no props. Change the component signature to accept a prop:

```tsx
interface Props {
  onPhoneAnswer: (body: string) => Promise<{ ok: boolean; error?: string }>;
}

export function WebViewHost({ onPhoneAnswer }: Props) {
  // existing body unchanged — see Step 6
}
```

- [ ] **Step 6: Extend the `onMessage` handler with a `sendChat` case**

Same file, in the existing `onMessage` callback (around line 121). After the existing `if (data?.type === 'ready') { … }` block, add:

```tsx
          if (data?.type === 'sendChat' && typeof data.body === 'string') {
            void onPhoneAnswer(data.body).then((result) => {
              if (!result.ok) console.warn('[WebViewHost] sendChat failed', result.error);
            });
            return;
          }
```

The full `onMessage` block should now read:

```tsx
      onMessage={(e) => {
        try {
          const data = JSON.parse(e.nativeEvent.data);
          if (data?.type === '__console') {
            console.log('[WV:' + (data.level || 'log') + ']', data.body);
            return;
          }
          if (data?.type === 'ready') {
            console.log('[WebViewHost] got ready');
            setReady(true);
            return;
          }
          if (data?.type === 'sendChat' && typeof data.body === 'string') {
            void onPhoneAnswer(data.body).then((result) => {
              if (!result.ok) console.warn('[WebViewHost] sendChat failed', result.error);
            });
            return;
          }
        } catch { /* ignore non-JSON */ }
      }}
```

Note: if the existing `ready` case does not end with an explicit `return;`, add one (shown above). It currently falls through, which is harmless today but brittle as more cases are added.

- [ ] **Step 7: Thread `session.sendChat` from `SessionScreen`**

Open `mobile/src/session/SessionScreen.tsx`. Find the `<WebViewHost />` render (around line 72). Change it to:

```tsx
        <WebViewHost onPhoneAnswer={session.sendChat} />
```

- [ ] **Step 8: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: PASS. If `sendChat` isn't exposed on `useSession` yet (Task 1 incomplete), surface the error and stop — Tasks are sequentially dependent.

- [ ] **Step 9: Commit**

```bash
git add src/mobile-renderer/sendAnswer.ts \
        src/mobile-renderer/__tests__/sendAnswer.test.ts \
        mobile/src/webview-host/WebViewHost.tsx \
        mobile/src/session/SessionScreen.tsx
git commit -m "feat(mobile-bridge): WebView→host sendChat bridge, sendAnswer helper"
```

---

## Task 3: Wire interactive `QuestionBubble` into `ChatView`

**Files:**
- Modify: `src/mobile-renderer/ChatView.tsx`
- Modify: `src/mobile-renderer/__tests__/ChatView.test.tsx`

Render `QuestionBubble` (direct-import from desktop) when `snapshot.waiting?.questions[0]` has options. Suppress the italic "Awaiting your response" line when the interactive bubble is up.

### Step 1: Extend tests first

- [ ] **Step 1: Update the `vi.mock` for `QuestionBubble`**

Open `src/mobile-renderer/__tests__/ChatView.test.tsx`. Locate the existing `vi.mock('../../renderer/src/components/OfficeView/MessageBubble', …)` block and, right below it, add a mock for `QuestionBubble` so tests can assert its presence without pulling in the desktop theme/utilities:

```ts
vi.mock('../../renderer/src/components/OfficeView/QuestionBubble', () => ({
  QuestionBubble: ({ question, onSelect }: {
    question: { question: string; options: { label: string }[] };
    onSelect: (label: string) => void;
  }) => (
    <div data-testid="qb" data-question={question.question}>
      {question.options.map((o) => (
        <button key={o.label} data-testid="qb-option" onClick={() => onSelect(o.label)}>
          {o.label}
        </button>
      ))}
    </div>
  ),
}));
```

- [ ] **Step 2: Append three new test cases**

Inside the existing `describe('ChatView', …)` block, just before the closing `});`, append:

```ts
  it('renders QuestionBubble when snapshot.waiting has options', () => {
    useSessionStore.setState({
      snapshot: {
        ...BASE_SNAPSHOT,
        chatTail: [{ id: 'm1', role: 'agent', agentRole: 'ceo', text: 'which?', timestamp: 10 }],
        waiting: {
          sessionId: 's1', agentRole: 'ceo',
          questions: [{
            question: 'Pick one', header: 'h',
            options: [{ label: 'A' }, { label: 'B' }],
            multiSelect: false,
          }],
        },
      },
    });
    const { getByText, getByTestId } = render(<ChatView />);
    expect(getByTestId('qb').getAttribute('data-question')).toBe('Pick one');
    expect(getByText('A')).toBeTruthy();
    expect(getByText('B')).toBeTruthy();
  });

  it('suppresses last-bubble isWaiting italic when interactive bubble is shown', () => {
    useSessionStore.setState({
      snapshot: {
        ...BASE_SNAPSHOT,
        chatTail: [{ id: 'm1', role: 'agent', agentRole: 'ceo', text: 'hi', timestamp: 10 }],
        waiting: {
          sessionId: 's1', agentRole: 'ceo',
          questions: [{ question: 'q', header: 'h', options: [{ label: 'A' }], multiSelect: false }],
        },
      },
    });
    const { getAllByTestId } = render(<ChatView />);
    expect(getAllByTestId('mb')[0].getAttribute('data-waiting')).toBe('false');
  });

  it('keeps isWaiting=true on last bubble when waiting has no options', () => {
    useSessionStore.setState({
      snapshot: {
        ...BASE_SNAPSHOT,
        chatTail: [{ id: 'm1', role: 'agent', agentRole: 'ceo', text: 'hi', timestamp: 10 }],
        waiting: { sessionId: 's1', agentRole: 'ceo', questions: [] },
      },
    });
    const { getAllByTestId } = render(<ChatView />);
    expect(getAllByTestId('mb')[0].getAttribute('data-waiting')).toBe('true');
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/mobile-renderer/__tests__/ChatView.test.tsx`
Expected: The 3 new tests FAIL (no `qb` testid found, `data-waiting='true'` when it should be `'false'`). Existing tests still pass.

### Step 4: Implement

- [ ] **Step 4: Rewrite `src/mobile-renderer/ChatView.tsx`**

Replace the file body with:

```tsx
import { useEffect, useRef } from 'react';
import type React from 'react';
import { useSessionStore } from '../../shared/stores/session.store';
import { MessageBubble } from '../renderer/src/components/OfficeView/MessageBubble';
import { QuestionBubble } from '../renderer/src/components/OfficeView/QuestionBubble';
import { PhaseSeparator } from './PhaseSeparator';
import { ActivityFooter } from './ActivityFooter';
import { AGENT_COLORS } from '../../shared/types';
import type { Phase } from '../../shared/types';
import { sendAnswer } from './sendAnswer';

export function ChatView(): React.JSX.Element {
  const snapshot = useSessionStore((s) => s.snapshot);
  const listRef = useRef<HTMLDivElement>(null);

  const messages = snapshot?.chatTail ?? [];
  const waiting = snapshot?.waiting ?? null;
  const firstQuestion = waiting?.questions?.[0];
  const showInteractive = !!firstQuestion && firstQuestion.options.length > 0;

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length, waiting]);

  if (messages.length === 0 && !waiting) {
    return <div className="chat-empty">No messages yet.</div>;
  }

  const rendered: React.ReactNode[] = [];
  let prevPhase: Phase | undefined;
  messages.forEach((m, i) => {
    if (m.phase && prevPhase !== undefined && m.phase !== prevPhase) {
      rendered.push(<PhaseSeparator key={`sep-${m.id}`} phase={m.phase} />);
    }
    if (m.phase) prevPhase = m.phase;
    const isLast = i === messages.length - 1;
    rendered.push(
      <MessageBubble
        key={m.id}
        msg={m}
        isWaiting={isLast && !!waiting && !showInteractive}
      />,
    );
  });

  if (showInteractive && waiting && firstQuestion) {
    const accent = AGENT_COLORS[waiting.agentRole] ?? '#6366f1';
    rendered.push(
      <QuestionBubble
        key="question-bubble"
        question={firstQuestion}
        accentColor={accent}
        isExpanded={true}
        onSelect={(label) => sendAnswer(label)}
      />,
    );
  }

  return (
    <>
      <div className="chat-list" ref={listRef}>{rendered}</div>
      <ActivityFooter />
    </>
  );
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run src/mobile-renderer/__tests__/ChatView.test.tsx`
Expected: PASS — all original tests + 3 new cases.

- [ ] **Step 6: Run the full mobile-renderer suite**

Run: `npx vitest run src/mobile-renderer`
Expected: All tests pass (ChatView, ActivityFooter, activityVerb, PortraitCamera, bridge, sendAnswer).

- [ ] **Step 7: Commit**

```bash
git add src/mobile-renderer/ChatView.tsx src/mobile-renderer/__tests__/ChatView.test.tsx
git commit -m "feat(mobile-chat): render interactive QuestionBubble when waiting has options"
```

---

## Task 4: Export `handleStartWarroom` / `handleStartBuild`

**Files:**
- Modify: `electron/ipc/phase-handlers.ts`

`handleStartImagine` is already exported (line 137). `handleStartWarroom` (line 215) and `handleStartBuild` (line 282) are module-local. They need to be exported so Task 5's `runAdvanceAfter` helper can call them directly without going through IPC.

- [ ] **Step 1: Add `export` to both function signatures**

Open `electron/ipc/phase-handlers.ts`. Line 215 currently reads:

```ts
async function handleStartWarroom(): Promise<void> {
```

Change to:

```ts
export async function handleStartWarroom(): Promise<void> {
```

Line 282 currently reads:

```ts
async function handleStartBuild(config: BuildConfig): Promise<void> {
```

Change to:

```ts
export async function handleStartBuild(config: BuildConfig): Promise<void> {
```

No other changes. The IPC registrations (`ipcMain.handle(IPC_CHANNELS.START_WARROOM, handleStartWarroom)` etc.) continue to work because `export` is additive.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "phase-handlers" | head -20`
Expected: No new errors in `phase-handlers.ts`.

- [ ] **Step 3: Run full test suite to guard regressions**

Run: `npm test`
Expected: 706 tests pass (or whatever the current post-sub-project-2 total is). No regressions.

- [ ] **Step 4: Commit**

```bash
git add electron/ipc/phase-handlers.ts
git commit -m "refactor(phase-handlers): export handleStartWarroom and handleStartBuild"
```

---

## Task 5: `runAdvanceAfter` helper + synthesis at three completion sites + restart re-register

**Files:**
- Create: `electron/orchestrator/phase-advance.ts` (pure module, no electron side-effects, testable in isolation)
- Create: `tests/electron/orchestrator/phase-advance.test.ts`
- Modify: `electron/ipc/phase-handlers.ts` (call `runAdvanceAfter` at 3 sites; add `resolverForRestoredQuestion`)
- Modify: `electron/ipc/project-handlers.ts` (use `resolverForRestoredQuestion`)

Introduces the core synthesis: when a phase marks completed, fire `runAdvanceAfter(from, dispatchNext)` which awaits an `AskUserQuestion` and then dispatches to the next phase handler via the injected callback. The separate file + DI structure avoids a circular import (phase-handlers → phase-advance → phase-handlers) and keeps the unit test independent of electron's top-level `ipcMain.handle(...)` side effects in `phase-handlers.ts`.

Plus: on app restart, `project-handlers.ts:165` re-hydrates the persisted pending question with a resolver. Replace the hardcoded `resumePhase` resolver with `resolverForRestoredQuestion(saved)` — a factory that detects phase-advance questions by text match and picks the right resolver (dispatch next phase for synthesized questions; fall back to `resumePhase` for real questions).

### Step 1: Write failing test

- [ ] **Step 1: Create `tests/electron/orchestrator/phase-advance.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the ONE electron-safe module phase-advance.ts imports from.
// `state.ts` doesn't pull `ipcMain`, so it loads cleanly in vitest.
vi.mock('../../../electron/ipc/state', () => ({
  handleAgentWaiting: vi.fn(),
}));

import * as state from '../../../electron/ipc/state';
import { runAdvanceAfter, PHASE_ADVANCE_OPTIONS } from '../../../electron/orchestrator/phase-advance';

describe('runAdvanceAfter', () => {
  let dispatch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    dispatch = vi.fn().mockResolvedValue(undefined);
  });

  it('imagine → synthesizes question with CEO role and "Continue to War Room" option', async () => {
    (state.handleAgentWaiting as any).mockResolvedValue({
      [PHASE_ADVANCE_OPTIONS.imagine.question]: PHASE_ADVANCE_OPTIONS.imagine.label,
    });
    await runAdvanceAfter('imagine', dispatch);
    expect(state.handleAgentWaiting).toHaveBeenCalledWith('ceo', [
      expect.objectContaining({
        question: PHASE_ADVANCE_OPTIONS.imagine.question,
        options: [{ label: PHASE_ADVANCE_OPTIONS.imagine.label }],
        multiSelect: false,
      }),
    ]);
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it('warroom → synthesizes question with project-manager role', async () => {
    (state.handleAgentWaiting as any).mockResolvedValue({
      [PHASE_ADVANCE_OPTIONS.warroom.question]: PHASE_ADVANCE_OPTIONS.warroom.label,
    });
    await runAdvanceAfter('warroom', dispatch);
    expect(state.handleAgentWaiting).toHaveBeenCalledWith('project-manager', [
      expect.objectContaining({
        question: PHASE_ADVANCE_OPTIONS.warroom.question,
        options: [{ label: PHASE_ADVANCE_OPTIONS.warroom.label }],
      }),
    ]);
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it('rejected question (project switch) does NOT call dispatch', async () => {
    (state.handleAgentWaiting as any).mockRejectedValue(new Error('Project switch'));
    await runAdvanceAfter('imagine', dispatch);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/electron/orchestrator/phase-advance.test.ts`
Expected: FAIL — "Cannot find module '../../../electron/orchestrator/phase-advance'".

### Step 3: Implement `runAdvanceAfter` in its own module

- [ ] **Step 3: Create `electron/orchestrator/phase-advance.ts`**

```ts
// electron/orchestrator/phase-advance.ts
//
// When a phase (imagine or warroom) completes, synthesize an
// AskUserQuestion that serves as the user's "advance to next phase"
// trigger. Desktop renders the same QuestionBubble it shows for real
// questions (PhaseActionButton is retired in Task 6). Mobile sees it via
// sub-project 2's waiting signal and renders an interactive
// QuestionBubble. Tapping the option on either surface resolves the
// pending question; this module's `runAdvanceAfter` awaits that
// resolution and calls the injected `dispatchNext` callback, which the
// caller wires to the next phase handler.
//
// This module intentionally has zero electron side-effects (no
// `ipcMain.handle`) so it can be unit-tested without booting electron.
// The dependency on the next-phase handler is injected via
// `dispatchNext` — avoids a circular import with `phase-handlers.ts`.

import type { AgentRole } from '../../shared/types';
import { handleAgentWaiting } from '../ipc/state';

export const PHASE_ADVANCE_OPTIONS = {
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

export type PhaseAdvanceFrom = keyof typeof PHASE_ADVANCE_OPTIONS;

export async function runAdvanceAfter(
  from: PhaseAdvanceFrom,
  dispatchNext: () => Promise<void>,
): Promise<void> {
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
    return;
  }
  try {
    await dispatchNext();
  } catch (err) {
    console.warn(`[phase-advance] ${from} dispatchNext failed:`, err);
  }
}
```

- [ ] **Step 4: Run the phase-advance test to verify pass**

Run: `npx vitest run tests/electron/orchestrator/phase-advance.test.ts`
Expected: PASS — 3 tests.

### Step 5: Wire `runAdvanceAfter` at the three completion sites

- [ ] **Step 5: Add import + insert `void runAdvanceAfter(...)` at the three sites**

Open `electron/ipc/phase-handlers.ts`. Add this import near the top (alongside other `../orchestrator/...` imports at lines 26–36):

```ts
import { runAdvanceAfter } from '../orchestrator/phase-advance';
```

Three call sites — add a single line after each `markCompleted` call with the injected next-phase callback:

Site 1 — end of `handleStartImagine`, after `pm.markCompleted('imagine');` (line 205):

```ts
    statsCollector?.onPhaseComplete('imagine');
    pm.markCompleted('imagine');
    void runAdvanceAfter('imagine', () => handleStartWarroom());   // NEW
  } catch (err: any) {
```

Site 2 — end of `handleStartWarroom` main flow, after `phaseMachine!.markCompleted('warroom');` (line 271):

```ts
    statsCollector?.onPhaseComplete('warroom');
    phaseMachine!.markCompleted('warroom');
    void runAdvanceAfter('warroom', () => handleStartBuild({        // NEW
      modelPreset: 'default',
      retryLimit: 2,
      permissionMode: 'auto-all',
    }));
  } catch (err: any) {
```

Site 3 — end of `handleResumeWarroom`, after `phaseMachine!.markCompleted('warroom');` (line 486):

```ts
    statsCollector?.onPhaseComplete('warroom');
    phaseMachine!.markCompleted('warroom');
    void runAdvanceAfter('warroom', () => handleStartBuild({        // NEW
      modelPreset: 'default',
      retryLimit: 2,
      permissionMode: 'auto-all',
    }));
  } catch (err: any) {
```

Note: the line numbers reflect the file state after Task 4 (which added `export` but otherwise didn't change line counts). If `grep -n "markCompleted" electron/ipc/phase-handlers.ts` reports different line numbers, use those — the rule is "one line after every `markCompleted('imagine')` or `markCompleted('warroom')` call in a normal (non-error) flow." Skip sites inside catch blocks.

- [ ] **Step 6: Typecheck + full tests**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -E "phase-handlers|phase-advance" | head -20
```

Expected: No new errors.

Run: `npm test`

Expected: All tests pass — the 3 new `runAdvanceAfter` tests + the unchanged existing suite.

### Step 7: Restart awaiter re-registration

On app restart, `electron/ipc/project-handlers.ts:165` already restores `pendingQuestions` with a resolver that calls `resumePhase(savedPhase)` — which re-runs the phase with conversation context. That's correct for *real* pending questions (questions the agent asked that the user didn't answer before quit). For *synthesized phase-advance* questions, we want a different resolver that dispatches to the next phase handler instead.

Clean hook: a `resolverForRestoredQuestion(saved)` factory in `phase-handlers.ts` that picks the right resolver based on the question's text.

- [ ] **Step 7: Add `resolverForRestoredQuestion` helper**

Open `electron/ipc/phase-handlers.ts`. After `handleStartBuild`'s closing brace (around line 360, before `resumePhase`), add:

```ts
/**
 * On app restart, the persisted pending question is re-hydrated but the
 * original in-process awaiter is gone. This factory returns the right
 * resolver: if the question matches a phase-advance signature, answering
 * dispatches to the next phase handler; otherwise, the default behavior
 * re-runs the phase via `resumePhase` so the agent sees the conversation
 * context.
 */
export function resolverForRestoredQuestion(
  saved: { questions: AskQuestion[]; phase?: Phase },
): () => void {
  const q = saved.questions[0];
  if (q) {
    if (q.question === PHASE_ADVANCE_OPTIONS.imagine.question) {
      return () => { void handleStartWarroom(); };
    }
    if (q.question === PHASE_ADVANCE_OPTIONS.warroom.question) {
      return () => {
        void handleStartBuild({
          modelPreset: 'default',
          retryLimit: 2,
          permissionMode: 'auto-all',
        });
      };
    }
  }
  const savedPhase = saved.phase ?? 'imagine';
  return () => { resumePhase(savedPhase as Phase); };
}
```

Extend the existing import of `runAdvanceAfter` from Step 5 to also import `PHASE_ADVANCE_OPTIONS`:

```ts
import { runAdvanceAfter, PHASE_ADVANCE_OPTIONS } from '../orchestrator/phase-advance';
```

`Phase` is already imported from `'../../shared/types'` (line 10 of the existing `import type { ... }` block). `AskQuestion` is NOT. Add it by editing that block — insert `AskQuestion,` alphabetically:

```ts
import type {
  AppSettings,
  AskQuestion,
  BuildConfig,
  // …rest unchanged…
} from '../../shared/types';
```

- [ ] **Step 8: Wire the factory in `electron/ipc/project-handlers.ts`**

Open `electron/ipc/project-handlers.ts`. Line 165 currently reads:

```ts
        pendingQuestions.set(saved.sessionId, {
          resolve: () => { resumePhase(savedPhase as Phase); },
          reject: () => {},
        });
```

Replace with:

```ts
        pendingQuestions.set(saved.sessionId, {
          resolve: resolverForRestoredQuestion(saved),
          reject: () => {},
        });
```

Add the import at the top of the file (inside the existing `from './phase-handlers'` block if one exists, else add a new line):

```ts
import { resolverForRestoredQuestion } from './phase-handlers';
```

Note: `resumePhase` is also imported from `./phase-handlers` already (line 31 and surrounding). If the existing import block covers `resumePhase`, add `resolverForRestoredQuestion` to that same block:

```ts
import {
  // …existing imports from './phase-handlers'…
  resolverForRestoredQuestion,
} from './phase-handlers';
```

The `resumePhase` import can stay if other code paths in `project-handlers.ts` still use it; if it becomes unused (Task 6 may remove any other reference), the typechecker will flag it — delete it then.

- [ ] **Step 9: Typecheck + full tests**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -E "phase-handlers|project-handlers" | head -20
npm test
```

Expected: No new type errors; all existing tests + the 3 new `phase-advance.test.ts` cases pass.

- [ ] **Step 10: Commit**

```bash
git add electron/orchestrator/phase-advance.ts \
        electron/ipc/phase-handlers.ts \
        electron/ipc/project-handlers.ts \
        tests/electron/orchestrator/phase-advance.test.ts
git commit -m "feat(phase-advance): synthesize AskUserQuestion + resolver factory for restored questions"
```

---

## Task 6: Retire `PhaseActionButton`

**Files:**
- Delete: `src/renderer/src/components/OfficeView/PhaseActionButton.tsx`
- Modify: `src/renderer/src/components/OfficeView/ChatPanel.tsx`

With `runAdvanceAfter` synthesizing the advance question, the existing `ChatPanel.renderQuestionBubble()` already renders it as a `QuestionBubble` on desktop. The dedicated button is redundant.

- [ ] **Step 1: Remove the import in `ChatPanel.tsx`**

Open `src/renderer/src/components/OfficeView/ChatPanel.tsx`. Line 11:

```ts
import { PhaseActionButton } from './PhaseActionButton';
```

Delete this line.

- [ ] **Step 2: Remove the JSX reference**

Same file. Line 391:

```tsx
          <PhaseActionButton />
```

Delete this line.

- [ ] **Step 3: Delete the component file**

```bash
rm src/renderer/src/components/OfficeView/PhaseActionButton.tsx
```

- [ ] **Step 4: Typecheck and tests**

```bash
npx tsc --noEmit 2>&1 | grep -E "PhaseActionButton|ChatPanel" | head -10
npm test
```

Expected: No references to `PhaseActionButton` remain. All tests pass. If any test imports or asserts on `PhaseActionButton`, update or remove them as part of this task (they're stale).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/OfficeView/ChatPanel.tsx src/renderer/src/components/OfficeView/PhaseActionButton.tsx
git commit -m "refactor(chat-panel): retire PhaseActionButton — synthesized question replaces it"
```

---

## Task 7: Rebuild + full test + manual QA

**Files:** none directly modified; rebuild regenerates `mobile/assets/webview/index.html`.

- [ ] **Step 1: Rebuild the mobile WebView bundle**

Run: `npm run build:mobile-all`
Expected: no errors; bundle written.

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: all vitest suites pass. Also run the mobile-side jest suite:

```bash
cd mobile && npx jest
```

Expected: all jest suites pass.

- [ ] **Step 3: Commit the rebuilt bundle**

```bash
git add mobile/assets/webview/index.html
git commit -m "chore(mobile): rebuild webview bundle with interactive QuestionBubble"
```

- [ ] **Step 4: Manual QA (human-run after branch merge)**

Skip in automated execution. The 5-step QA checklist from the spec runs in a real paired-device scenario:

1. **Phone answers a real question** — agent asks a multi-option question; phone shows expanded `QuestionBubble`; tap an option; chat log on both surfaces records the answer with the 📱 Mobile badge; agent resumes.
2. **Desktop answers same question** — bubble clears on phone.
3. **Phase advance from phone** — complete an imagine phase; phone shows the 1-option bubble; tap; war room begins; bubble clears.
4. **Phase advance from desktop** — same setup; click the card on desktop; war room begins.
5. **Phase advance via typed text** — same setup; type "Continue to War Room" in desktop composer; war room begins.

Pass all five → sub-project 3a done.

---

## Notes for the implementer

- **Sub-project 2 must be merged first.** Task 3 depends on `SessionSnapshot.waiting` existing; Task 5 relies on sub-project 2's `mobileBridge?.onAgentWaiting(null)` call in the resolve sites. If main doesn't have those commits, stop and rebase.
- **Don't touch sub-project 3b scope** — no archived runs, no uncapped history, no `chatTail` > 50 changes.
- **`handleAgentWaiting` persists to disk.** The synthesized phase-advance question is persisted like any real question. Combined with Task 5's Step 7–11 restart-recovery, this covers the restart edge case from the spec.
- **The `void` prefix on `runAdvanceAfter(...)` calls is load-bearing.** It marks the async call as deliberately fire-and-forget; the surrounding `handleStartImagine` / `handleStartWarroom` / `handleResumeWarroom` function's own lifecycle ends after `markCompleted`, matching the existing control flow.
- **`tryReregisterPhaseAdvanceAwaiter` uses the question's text as its signature.** Any future change to `PHASE_ADVANCE_OPTIONS.imagine.question` or `.warroom.question` will invalidate in-flight restored questions from before the change. Acceptable because the phase-advance question is short-lived by design.
