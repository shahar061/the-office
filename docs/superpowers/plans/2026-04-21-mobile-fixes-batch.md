# Mobile Fixes Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two production bugs: (1) the relay seqRegression kick caused by the Spec B receiver-side reset resetting the envelope seq counter, and (2) the missing mobile echo when the user answers an `AskUserQuestion` on desktop.

**Architecture:** Fix 1 splits the ratchet reset into two modes — full reset on own-WS connect (unchanged behavior) vs. crypto-only reset on peer-reconnect signal (new, doesn't touch envelope seq). Fix 2 extends the `USER_RESPONSE` IPC handler to also call `mobileBridge.onChat(...)` with the question + answer, matching the existing `SEND_MESSAGE` pattern.

**Tech Stack:** TypeScript, Electron main + renderer, Expo mobile shell, Vitest for desktop tests, Jest for mobile tests.

**Spec:** `docs/superpowers/specs/2026-04-21-mobile-fixes-batch-design.md`

---

## File Structure

**Fix 1 — split crypto reset:**
- Modify: `electron/mobile-bridge/relay-connection.ts` — split `resetStreams` into full + crypto-only; call crypto-only from the `seq=0` branch.
- Modify: `mobile/src/transport/relay-ws.transport.ts` — rename existing `resetCryptoStreams` to `resetAllOnConnect`; add `resetCryptoOnly` (no seq reset); wire accordingly.
- Test: `electron/mobile-bridge/__tests__/relay-connection.test.ts` — extend with a seq-preservation assertion.
- Test: `mobile/src/__tests__/relay-ws.transport.test.ts` — extend with a seq-preservation assertion.

**Fix 2 — Q&A mobile echo:**
- Modify: `electron/ipc/phase-handlers.ts` — `USER_RESPONSE` handler broadcasts Q&A to mobile.
- Test: `tests/electron/ipc/user-response-echo.test.ts` (new).

**Spec doc update:**
- Modify: `docs/superpowers/specs/2026-04-21-relay-ratchet-reset-design.md` — strike Protocol Invariant step 3 with clarifying note.

---

## Task 1: Desktop — split `resetStreams` in `RelayConnection`

**Files:**
- Modify: `electron/mobile-bridge/relay-connection.ts`
- Test: `electron/mobile-bridge/__tests__/relay-connection.test.ts` — extend

**Intent:** Split `resetStreams()` into a full reset (used on own-WS connect) and a crypto-only reset (used on peer-reconnect `seq=0` signal). The crypto-only variant leaves `this.seq` intact so the envelope counter continues monotonically, matching the worker's expectation that our outgoing seq only resets when our own WS reconnects.

- [ ] **Step 1: Write the failing test**

Append a new `it` to the existing `describe('RelayConnection', ...)` block in `electron/mobile-bridge/__tests__/relay-connection.test.ts` (after the last existing `it`):

```ts
  it('preserves outgoing seq across peer-reconnect reset (seqRegression regression guard)', async () => {
    const { deriveSessionKeys } = await import('../../../shared/crypto/noise');
    const { SendStream } = await import('../../../shared/crypto/secretstream');
    const { encodeV2 } = await import('../../../shared/protocol/mobile');
    const { x25519 } = await import('@noble/curves/ed25519');

    const desktop = makeDesktop();
    const phonePriv = x25519.utils.randomPrivateKey();
    const phonePub = x25519.getPublicKey(phonePriv);
    const device = makeDevice({ phoneIdentityPub: Buffer.from(phonePub).toString('base64') });
    const conn = new RelayConnection({ desktop, device });
    const onRaw = (conn as any).onRawFrame.bind(conn) as (raw: string) => void;

    // Drive desktop's outgoing seq forward by calling sendMessage a few
    // times. We ignore the "not connected" guard by swapping isConnected.
    (conn as any).client.isConnected = () => true;
    (conn as any).client.send = () => {};
    conn.sendMessage({ type: 'heartbeat', v: 2 });
    conn.sendMessage({ type: 'heartbeat', v: 2 });
    conn.sendMessage({ type: 'heartbeat', v: 2 });
    expect((conn as any).seq).toBe(3);

    // Drive lastRecvSeq forward so the seq=0 branch fires.
    function makePhoneSend() {
      const keys = deriveSessionKeys(phonePriv, desktop.pub, 'initiator');
      return new SendStream(keys.sendKey);
    }
    let phoneSend = makePhoneSend();
    function encFrame(seq: number, msg: any): string {
      const plain = new TextEncoder().encode(encodeV2(msg));
      const ct = phoneSend.encrypt(plain);
      return JSON.stringify({
        v: 2, sid: device.sid!, seq, kind: 'data',
        ct: Buffer.from(ct).toString('base64'),
      });
    }
    onRaw(encFrame(0, { type: 'heartbeat', v: 2 }));
    onRaw(encFrame(1, { type: 'heartbeat', v: 2 }));
    expect((conn as any).lastRecvSeq).toBe(1);

    // Simulate peer reconnect — fresh SendStream, seq=0.
    phoneSend = makePhoneSend();
    onRaw(encFrame(0, { type: 'heartbeat', v: 2 }));

    // Crypto streams reset (peer reconnected), but outgoing seq MUST NOT reset.
    expect((conn as any).seq).toBe(3);
    expect((conn as any).lastRecvSeq).toBe(0);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/mobile-bridge/__tests__/relay-connection.test.ts`
Expected: the new test FAILS — after the seq=0 reset, `(conn as any).seq` is 0 (was reset by the existing `resetStreams()`).

- [ ] **Step 3: Implement the split**

Edit `electron/mobile-bridge/relay-connection.ts`. Locate the existing `resetStreams` method (around lines 74-80). Replace it with:

```ts
  private resetStreams(): void {
    this.resetCryptoStreams();
    this.seq = 0;
    this.lastRecvSeq = -1;
  }

  private resetCryptoStreams(): void {
    const keys = deriveSessionKeys(this.desktopPriv, this.phonePub, 'responder');
    this.send = new SendStream(keys.sendKey);
    this.recv = new RecvStream(keys.recvKey);
    this.lastRecvSeq = -1;
  }
```

Both methods re-derive keys and swap the SendStream + RecvStream. `resetStreams()` (used from `client.on('connect')`) additionally zeros `this.seq`. `resetCryptoStreams()` leaves `this.seq` alone. Both reset `this.lastRecvSeq` to -1 because the peer has just reset and will send starting from seq=0.

Now update the `onRawFrame` peer-reconnect branch. Locate the block:

```ts
    if (e.seq === 0 && this.lastRecvSeq >= 0) {
      this.resetStreams();
    }
```

Change to:

```ts
    if (e.seq === 0 && this.lastRecvSeq >= 0) {
      this.resetCryptoStreams();
    }
```

No other changes to the file. The constructor call and `client.on('connect')` path continue using `resetStreams()` (full reset).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run electron/mobile-bridge/__tests__/relay-connection.test.ts`
Expected: all tests pass (existing + the new seq-preservation assertion).

Full vitest: `npx vitest run`
Expected: all green (baseline + 1 new test).

- [ ] **Step 5: Commit**

```bash
git add electron/mobile-bridge/relay-connection.ts electron/mobile-bridge/__tests__/relay-connection.test.ts
git commit -m "fix(relay-conn): preserve outgoing seq on peer-reconnect reset"
```

---

## Task 2: Phone — split reset in `RelayWsTransport`

**Files:**
- Modify: `mobile/src/transport/relay-ws.transport.ts`
- Test: `mobile/src/__tests__/relay-ws.transport.test.ts` — extend

**Intent:** Symmetric split on the phone side. `resetCryptoStreams` (existing) becomes `resetAllOnConnect` (used from `connect()`). A new `resetCryptoOnly` handles the peer-reconnect path, leaving `this.seq` intact.

- [ ] **Step 1: Write the failing test**

Append to `mobile/src/__tests__/relay-ws.transport.test.ts` (inside the existing `describe('RelayWsTransport — seq=0 peer-reconnect reset', ...)` block, after the last existing `it`):

```ts
  it('preserves outgoing envelope seq across peer-reconnect reset (seqRegression regression guard)', () => {
    const { device, freshDesktopSend } = makeSetup();
    const t = new RelayWsTransport({ device, token: 'fake-token' });
    t.connect();
    lastSocket!.simulateOpen();

    let desktopSend = freshDesktopSend();

    // Complete auth so `sending` is unlocked.
    const authed: MobileMessageV2 = {
      type: 'authed', v: 2,
      snapshot: {
        sessionActive: true, sessionId: 'p', desktopName: 'D',
        phase: 'idle', startedAt: 1, activeAgentId: null,
        characters: [], chatTail: [], sessionEnded: false,
      },
    };
    lastSocket!.simulateStringMessage(encFrame(desktopSend, device.sid, 0, authed));

    // The transport's own sends advance this.seq. Auth already used seq=0,
    // so the transport is at seq=1 now. Send a few heartbeats explicitly.
    t.send({ type: 'heartbeat', v: 2 });
    t.send({ type: 'heartbeat', v: 2 });
    expect((t as any).seq).toBe(3);

    // Drive lastRecvSeq forward with a second incoming frame.
    lastSocket!.simulateStringMessage(encFrame(desktopSend, device.sid, 1, { type: 'heartbeat', v: 2 }));
    expect((t as any).lastRecvSeq).toBe(1);

    // Simulate desktop reconnecting with a fresh SendStream + seq=0.
    desktopSend = freshDesktopSend();
    lastSocket!.simulateStringMessage(encFrame(desktopSend, device.sid, 0, { type: 'heartbeat', v: 2 }));

    // Crypto streams reset, but outgoing seq MUST stay.
    expect((t as any).seq).toBe(3);
    expect((t as any).lastRecvSeq).toBe(0);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npx jest src/__tests__/relay-ws.transport.test.ts -t "preserves outgoing"`
Expected: FAIL — after the seq=0 reset, `(t as any).seq` is 0.

- [ ] **Step 3: Implement the split**

Edit `mobile/src/transport/relay-ws.transport.ts`. Locate the existing `resetCryptoStreams` method (around lines 134-142). Rename it and add a companion. The final shape:

```ts
  private resetAllOnConnect(): void {
    this.resetCryptoOnly();
    this.seq = 0;
  }

  private resetCryptoOnly(): void {
    const priv = b64decode(this.opts.device.identityPriv);
    const desktopPub = b64decode(this.opts.device.desktopIdentityPub);
    const keys = deriveSessionKeys(priv, desktopPub, 'initiator');
    this.sendStream = new SendStream(keys.sendKey);
    this.recvStream = new RecvStream(keys.recvKey);
    this.lastRecvSeq = -1;
  }
```

Update `connect()` (around line 71) to call the new full-reset method:

```ts
  connect(): void {
    if (this.fatalReason) return;
    this.clearReconnect();
    this.resetAllOnConnect();
    this.emitStatus({ state: 'connecting' });
    // ... rest of connect() unchanged ...
```

Update `handleRaw` — the peer-reconnect branch (currently calls `resetCryptoStreams()`):

```ts
    if (env.seq === 0 && this.lastRecvSeq >= 0) {
      this.resetCryptoOnly();
    }
```

No other changes.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd mobile && npx jest src/__tests__/relay-ws.transport.test.ts`
Expected: all existing + new test pass.

Full mobile jest: `cd mobile && npx jest`
Expected: baseline + 1 new = 52 green.

TypeScript: `cd mobile && npx tsc --noEmit 2>&1 | grep "relay-ws" | head`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/transport/relay-ws.transport.ts mobile/src/__tests__/relay-ws.transport.test.ts
git commit -m "fix(relay-ws-transport): preserve outgoing seq on peer-reconnect reset"
```

---

## Task 3: Desktop — broadcast `USER_RESPONSE` Q&A to mobile

**Files:**
- Modify: `electron/ipc/phase-handlers.ts`
- Test: `tests/electron/ipc/user-response-echo.test.ts` (new)

**Intent:** When the user answers an `AskUserQuestion` on desktop (taps an option in the `QuestionBubble` or types a free-text response), the answer is currently only persisted to `chatHistoryStore` and the mobile waiting state is cleared. Mobile never sees the Q&A as chat messages. Add a direct `mobileBridge.onChat(...)` call that forwards both the question-as-agent-message and the answer-as-user-message.

- [ ] **Step 1: Write the failing test**

Create `tests/electron/ipc/user-response-echo.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => {
  const ipcHandlers = new Map<string, (...args: any[]) => any>();
  return {
    ipcMain: {
      handle(channel: string, fn: (...args: any[]) => any) {
        ipcHandlers.set(channel, fn);
      },
      on() {},
      removeHandler() {},
      removeListener() {},
    },
    BrowserWindow: { getAllWindows: () => [] },
    app: { getPath: () => '/tmp' },
    dialog: {},
    __ipcHandlers: ipcHandlers,
  };
});

function makeBridgeStub(onChatSpy: ReturnType<typeof vi.fn>) {
  return {
    onChat: onChatSpy,
    start: async () => {},
    stop: async () => {},
    getPairingQR: async () => ({ qrPayload: '', expiresAt: 0 }),
    listDevices: async () => [],
    revokeDevice: async () => {},
    renameDevice: async () => {},
    setRemoteAccess: async () => {},
    pauseRelay: () => {},
    isRelayPaused: () => false,
    setLanHost: async () => {},
    getStatus: () => ({
      running: false, port: null, connectedDevices: 0, pendingSas: null,
      v1DeviceCount: 0, relay: 'disabled', relayPausedUntil: null, lanHost: null, devices: [],
    }),
    onAgentEvent: () => {},
    onStatePatch: () => {},
    onAgentWaiting: () => {},
    onArchivedRuns: () => {},
    onCharStates: () => {},
    onChange: () => () => {},
    onPhoneChat: () => () => {},
    onPhoneGetPhaseHistory: () => () => {},
    onSessionScopeChanged: () => {},
    __getSnapshotForTests: () => ({} as any),
  };
}

describe('USER_RESPONSE IPC handler — mobile echo', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('forwards the answered question + answer to mobileBridge.onChat', async () => {
    const { initPhaseHandlers } = await import('../../../electron/ipc/phase-handlers');
    const state = await import('../../../electron/ipc/state');
    const { IPC_CHANNELS } = await import('../../../shared/types');

    const onChatSpy = vi.fn();
    state.setMobileBridge(makeBridgeStub(onChatSpy) as any);

    // Register a pending question so the handler has something to resolve.
    const resolveSpy = vi.fn();
    state.pendingQuestions.set('session-1', {
      resolve: resolveSpy,
      reject: () => {},
    });

    initPhaseHandlers();

    const electron = await import('electron');
    const handler = (electron as any).__ipcHandlers.get(IPC_CHANNELS.USER_RESPONSE);
    expect(handler).toBeTruthy();

    await handler({}, 'session-1', {
      'Do you want to use TypeScript?': 'Yes, use TypeScript',
    });

    // `pending.resolve` was called so the orchestrator unblocks.
    expect(resolveSpy).toHaveBeenCalledTimes(1);

    // `mobileBridge.onChat` was called. Because currentChatPhase / currentChatAgentRole
    // are likely null in this isolated test, the persistence guard at the top of the
    // handler skips the chatHistoryStore path — but the mobile echo should still fire
    // with the question + answer text. If instead the echo is gated on the same check,
    // the test still asserts that onChat was called (via a non-null / non-empty array)
    // and we can tighten once we see the implementation shape.
    //
    // Minimum correctness: onChat was called with exactly ONE array containing two
    // messages — agent (question) + user (answer).
    expect(onChatSpy).toHaveBeenCalledTimes(1);
    const [msgs] = onChatSpy.mock.calls[0];
    expect(Array.isArray(msgs)).toBe(true);
    const roles = msgs.map((m: any) => m.role);
    expect(roles).toEqual(['agent', 'user']);
    expect(msgs[0].text).toBe('Do you want to use TypeScript?');
    expect(msgs[1].text).toBe('Yes, use TypeScript');
    expect(msgs[1].source).toBe('desktop');

    state.setMobileBridge(null);
    state.pendingQuestions.clear();
  });

  it('is a no-op when no pending question matches the session id', async () => {
    const { initPhaseHandlers } = await import('../../../electron/ipc/phase-handlers');
    const state = await import('../../../electron/ipc/state');
    const { IPC_CHANNELS } = await import('../../../shared/types');

    const onChatSpy = vi.fn();
    state.setMobileBridge(makeBridgeStub(onChatSpy) as any);

    initPhaseHandlers();

    const electron = await import('electron');
    const handler = (electron as any).__ipcHandlers.get(IPC_CHANNELS.USER_RESPONSE);

    await handler({}, 'session-nonexistent', { question: 'answer' });

    expect(onChatSpy).not.toHaveBeenCalled();

    state.setMobileBridge(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/electron/ipc/user-response-echo.test.ts`
Expected: the first test FAILS — `onChat` is not called today.

- [ ] **Step 3: Implement the broadcast**

Edit `electron/ipc/phase-handlers.ts`. Locate the `USER_RESPONSE` handler (currently at lines 749-786):

```ts
  ipcMain.handle(IPC_CHANNELS.USER_RESPONSE, async (_event, sessionId: string, answers: Record<string, string>) => {
    // Clear persisted waiting state regardless of whether a live session exists
    if (currentProjectDir) clearWaitingState(currentProjectDir);

    const pending = pendingQuestions.get(sessionId);
    if (pending) {
      if (chatHistoryStore && currentChatPhase && currentChatAgentRole && currentChatRunNumber > 0) {
        // Persist the question text as an agent message
        const questionText = Object.keys(answers).join('\n');
        if (questionText) {
          const questionMsg: ChatMessage = {
            id: randomUUID(),
            role: 'agent',
            agentRole: currentChatAgentRole,
            text: questionText,
            timestamp: Date.now(),
          };
          chatHistoryStore.appendMessage(currentChatPhase, currentChatAgentRole, currentChatRunNumber, questionMsg);
        }

        // Persist user's answer
        const answerText = Object.values(answers).join('\n');
        if (answerText) {
          const userMsg: ChatMessage = {
            id: randomUUID(),
            role: 'user',
            text: answerText,
            timestamp: Date.now(),
          };
          chatHistoryStore.appendMessage(currentChatPhase, currentChatAgentRole, currentChatRunNumber, userMsg);
        }
      }

      pendingQuestions.delete(sessionId);
      pending.resolve(answers);
      mobileBridge?.onAgentWaiting(null);   // NEW
    }
  });
```

Replace with — the new logic lifts `questionText`/`answerText` out of the `if (chatHistoryStore && ...)` guard so they're visible to the mobile-echo block, which fires unconditionally on mobile as long as we have a pending question:

```ts
  ipcMain.handle(IPC_CHANNELS.USER_RESPONSE, async (_event, sessionId: string, answers: Record<string, string>) => {
    // Clear persisted waiting state regardless of whether a live session exists
    if (currentProjectDir) clearWaitingState(currentProjectDir);

    const pending = pendingQuestions.get(sessionId);
    if (pending) {
      const questionText = Object.keys(answers).join('\n');
      const answerText = Object.values(answers).join('\n');

      if (chatHistoryStore && currentChatPhase && currentChatAgentRole && currentChatRunNumber > 0) {
        if (questionText) {
          const questionMsg: ChatMessage = {
            id: randomUUID(),
            role: 'agent',
            agentRole: currentChatAgentRole,
            text: questionText,
            timestamp: Date.now(),
          };
          chatHistoryStore.appendMessage(currentChatPhase, currentChatAgentRole, currentChatRunNumber, questionMsg);
        }

        if (answerText) {
          const userMsg: ChatMessage = {
            id: randomUUID(),
            role: 'user',
            text: answerText,
            timestamp: Date.now(),
          };
          chatHistoryStore.appendMessage(currentChatPhase, currentChatAgentRole, currentChatRunNumber, userMsg);
        }
      }

      // Forward the Q&A to mobile as chat messages. Direct mobileBridge.onChat
      // (not sendChat) — same pattern as SEND_MESSAGE. Desktop's ChatPanel
      // already adds both to its local store optimistically (ChatPanel.tsx
      // lines 189-221), so routing through sendChat would double-render.
      if (mobileBridge) {
        const msgs: ChatMessage[] = [];
        if (questionText) {
          msgs.push({
            id: randomUUID(),
            role: 'agent',
            agentRole: currentChatAgentRole ?? undefined,
            text: questionText,
            timestamp: Date.now(),
          });
        }
        if (answerText) {
          msgs.push({
            id: randomUUID(),
            role: 'user',
            text: answerText,
            timestamp: Date.now(),
            source: 'desktop',
          });
        }
        if (msgs.length > 0) mobileBridge.onChat(msgs);
      }

      pendingQuestions.delete(sessionId);
      pending.resolve(answers);
      mobileBridge?.onAgentWaiting(null);
    }
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/electron/ipc/user-response-echo.test.ts`
Expected: both tests pass.

Full vitest: `npx vitest run`
Expected: baseline + 2 new tests green.

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/phase-handlers.ts tests/electron/ipc/user-response-echo.test.ts
git commit -m "fix(ipc): echo AskUserQuestion Q&A to mobile on USER_RESPONSE"
```

---

## Task 4: Spec doc update — reflect the decoupled reset

**Files:**
- Modify: `docs/superpowers/specs/2026-04-21-relay-ratchet-reset-design.md`

**Intent:** The Protocol Invariant in the Spec B design doc lists "Set own `seq = 0`" as step 3 of the receiver-side reset. That step caused the seqRegression bug. Update the spec doc to reflect that the envelope seq counter is tied to the local WS lifecycle, not the crypto ratchet.

- [ ] **Step 1: Edit the Protocol Invariant section**

Open `docs/superpowers/specs/2026-04-21-relay-ratchet-reset-design.md`. Locate the `## Protocol Invariant` section. The receiver-side reset rule lists five numbered steps. Replace the numbered list with the corrected version:

```markdown
**If `env.seq === 0` AND `this.lastRecvSeq >= 0`:**

1. Re-derive session keys from the long-lived identity pair using `deriveSessionKeys` with the same role label (`'responder'` on desktop, `'initiator'` on phone).
2. Instantiate fresh `SendStream` and `RecvStream` with those keys (counters at 0).
3. **Leave `this.seq` unchanged.** The envelope seq counter is tied to the local WS lifecycle — the Cloudflare worker only resets its `lastSeq[us]` tracking when our own WS reconnects. If we reset `this.seq` here, the next outbound envelope at seq=0 would trigger the worker's anti-regression gate and close our WS with `1008 seqRegression`. (Original spec had a "set own seq = 0" step — that was wrong; see the 2026-04-21 fix batch.)
4. Set `lastRecvSeq = -1` so the dedup gate accepts the incoming `seq=0`.
5. Decrypt the envelope with the fresh `recv` stream.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-04-21-relay-ratchet-reset-design.md
git commit -m "docs(specs): correct Spec B protocol invariant — don't reset seq on peer-reconnect"
```

---

## Task 5: End-to-end validation

**Files:** None — validation only.

- [ ] **Step 1: Full suites**

```bash
npx vitest run
cd mobile && npx jest && cd ..
```

Expected: all green. Vitest baseline was 787 before this plan; after the two new tests (+1 from Task 1, +2 from Task 3) expect **790**. Mobile jest baseline was 51 (51 after the cross-phase history feature — includes the 2 WebViewHost tests from that merge); after Task 2 adds 1 test, expect **52**.

If counts disagree slightly, accept any green result and note the actual numbers.

- [ ] **Step 2: Manual QA — Q&A mobile echo**

1. Pair the phone (any transport). Open a project on desktop.
2. Trigger an `AskUserQuestion` flow (e.g., start `/imagine` and reach a question).
3. On the desktop, tap an option in the `QuestionBubble`.
4. Observe the phone's chat tab:
   - Waiting bubble disappears (existing behavior).
   - Agent's question appears as an `agent` message in the chat tail. *(new)*
   - User's selected answer appears as a `user` message with the mobile indicator. *(new)*

- [ ] **Step 3: Manual QA — seqRegression bug gone**

This one is harder to reliably trigger because it depended on a specific worker-cooldown race. The confidence signal is: under normal reconnect stress (toggle airplane mode briefly, Wi-Fi blip, etc.), the phone should never see a `[relay-ws] close 1008 seqRegression` log. Do a few reconnect cycles and confirm no such log line appears.

If a `seqRegression` appears, capture the full log and escalate — the fix may need broader changes.

- [ ] **Step 4: Nothing to commit unless QA surfaces an issue.**

---

## Spec Coverage Checklist

| Spec requirement | Task(s) |
|---|---|
| Decouple crypto reset from seq reset on desktop | 1 |
| Decouple crypto reset from seq reset on phone | 2 |
| `resetStreams()` (full) preserved on desktop WS-connect path | 1 |
| `resetAllOnConnect()` (full) used on phone WS-connect path | 2 |
| `resetCryptoStreams()` (crypto-only) used for desktop seq=0 branch | 1 |
| `resetCryptoOnly()` (crypto-only) used for phone seq=0 branch | 2 |
| Mobile receives Q&A when user answers on desktop | 3 |
| Q&A echo uses direct `mobileBridge.onChat` (no `sendChat` double-render) | 3 |
| Spec B doc updated to reflect the fix | 4 |
| No protocol changes on the wire | All (envelope shape unchanged) |
| No Cloudflare Worker changes | All |
| End-to-end validation | 5 |
