# Mobile Fixes Batch — Design

> **Partial supersede (crypto portions only) by `2026-04-21-relay-stateless-nonces-design.md` (2026-04-21).** Fix 1 in this doc (the `resetStreams` / `resetCryptoStreams` split on desktop and `resetAllOnConnect` / `resetCryptoOnly` on phone) has been retired along with the entire counter-based crypto ratchet. Fix 2 (`USER_RESPONSE` Q&A mobile echo) is unrelated and remains in effect.

**Date:** 2026-04-21
**Status:** Approved for planning

## Problem

Two bugs surfaced after this week's mobile work went to production:

1. **`seqRegression` kick on relay.** Under certain reconnect timing, the phone's relay WS gets closed by the Cloudflare worker with code `1008 seqRegression` followed by a burst of `decrypt failed: no matching nonce in window` on the next reconnect attempt. Root cause: the Spec B receiver-side reset (shipped last session) resets the envelope seq counter (`this.seq = 0`) on the peer-reconnect `seq=0` signal path. On the own-WS-reconnect path that's correct (the worker resets `lastSeq[us] = -1` on our new WS). On the peer-reconnect path it's wrong: our WS didn't drop, the worker never reset `lastSeq[us]`, so our next outbound envelope at seq=0 triggers the worker's anti-regression gate and kicks us.

2. **Desktop-chosen `AskUserQuestion` answer missing on mobile.** When a question is open and the user taps an option on the desktop's `QuestionBubble`, the mobile waiting bubble disappears but no message appears in the mobile chat tail showing what was chosen. Root cause: `electron/ipc/phase-handlers.ts`'s `USER_RESPONSE` handler persists the Q&A to `chatHistoryStore` and calls `mobileBridge.onAgentWaiting(null)` to clear the waiting state, but never calls `mobileBridge.onChat(...)` to forward the question + answer to the phone's chat tail. Same class of bug as the old `SEND_MESSAGE` no-op we fixed earlier.

## Goals

1. Phone's relay WS no longer gets kicked with `seqRegression` when the peer-reconnect receiver-reset fires.
2. When a user picks an option on the desktop `QuestionBubble`, the question + answer appear in the mobile chat tail the same way a desktop-typed message already does.
3. The existing Spec B receiver-reset semantics stay intact for the crypto ratchet (fresh ChaCha keys), only the envelope seq handling changes.

## Non-Goals

- Any change to the Cloudflare worker (`session-do.ts`). The worker's anti-regression gate is correct — it's our client code that was wrongly resetting seq.
- Any change to the protocol on the wire. Envelope shape unchanged.
- Any change to how `AskUserQuestion` itself is delivered, answered, or persisted on desktop. Only the mobile echo path is added.
- Changes to the mobile-selected answer path (`sendAnswer(label)` → webview postMessage → phone transport). That already works.

## Fix 1 — Decouple crypto-reset from seq reset

**Invariant:** `this.seq` (envelope seq counter) is tied to the **local WS lifecycle**, not the crypto ratchet. It must be zeroed only when our own WS reconnects (which is also when the worker resets its `lastSeq[us] = -1`, keeping both sides aligned). The ChaCha ratchet (SendStream/RecvStream) can be reset independently, either on our WS reconnect or when we detect the peer's reconnect via the envelope `seq=0` signal.

### Desktop — `electron/mobile-bridge/relay-connection.ts`

Today:
```ts
private resetStreams(): void {
  const keys = deriveSessionKeys(this.desktopPriv, this.phonePub, 'responder');
  this.send = new SendStream(keys.sendKey);
  this.recv = new RecvStream(keys.recvKey);
  this.seq = 0;
  this.lastRecvSeq = -1;
}
```

Called from two places:
- `this.client.on('connect', () => this.resetStreams())` — our WS connected/reconnected. Full reset is correct here.
- `onRawFrame` — on the `seq=0 && lastRecvSeq >= 0` peer-reconnect branch. Full reset is WRONG here — `this.seq = 0` is the bug.

Split into two methods:

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

`resetStreams()` (the full form) keeps its existing call from `client.on('connect')`. The `onRawFrame` peer-reconnect branch calls `resetCryptoStreams()` instead.

### Phone — `mobile/src/transport/relay-ws.transport.ts`

Symmetric split. Today's `resetCryptoStreams()` does the full reset including `this.seq = 0`; it's called from both `connect()` and the `handleRaw` peer-reconnect branch.

Rename the existing method to `resetAllOnConnect()`. Add a new `resetCryptoOnly()` that does the keys + streams + `lastRecvSeq = -1` but NOT `this.seq = 0`. Wire `connect()` → `resetAllOnConnect()` (unchanged behavior). Wire the `handleRaw` peer-reconnect branch → `resetCryptoOnly()`.

Rename chosen so it's clear which is which at the call site.

## Fix 2 — Broadcast `USER_RESPONSE` Q&A to mobile

**File:** `electron/ipc/phase-handlers.ts`, `USER_RESPONSE` handler (currently at lines 749-786).

Today the handler, when a pending question resolves:
1. Persists the question-as-agent-message to `chatHistoryStore`.
2. Persists the answer-as-user-message to `chatHistoryStore`.
3. Resolves the pending promise (unblocks the orchestrator).
4. Clears mobile waiting state via `mobileBridge?.onAgentWaiting(null)`.

Add: after (2) and before (3), also forward the question + answer to mobile as chat messages.

```ts
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
```

Direct `mobileBridge.onChat(...)` (not `sendChat()`) — same pattern as the existing `SEND_MESSAGE` fix. Avoids double-rendering on desktop, where `ChatPanel.tsx:189-221` already adds both question + answer to its local store optimistically.

`source: 'desktop'` matches the existing convention for desktop-originated user messages.

## Testing

Desktop relay:

- Extend `electron/mobile-bridge/__tests__/relay-connection.test.ts` — add a case: drive `lastRecvSeq` to 5, synthesize a `seq=0` envelope under a fresh phone-side stream, assert the message is decoded AND assert `(conn as any).seq` is **unchanged** from its prior value (not reset to 0). The existing "seq=0 after active session" test that asserts `lastRecvSeq === 0` still holds.

Phone relay:

- Extend `mobile/src/__tests__/relay-ws.transport.test.ts` — after the existing seq=0 reset test completes (drive lastRecvSeq to 1, then feed a fresh-stream seq=0), assert a subsequent call to `transport.send({type: 'heartbeat', v: 2})` produces an envelope with `seq === (pre-reset seq)` (no regression). The current test peeks at `(t as any).lastRecvSeq`; add a peek at `(t as any).seq` showing it's non-zero after the reset fires.

`USER_RESPONSE` handler:

- Add a test in `tests/electron/ipc/` (new file or extend `send-message-echo.test.ts`) — stub `mobileBridge` with an `onChat` spy, register a pending question via `state.pendingQuestions.set(...)`, invoke the IPC handler with `answers`, assert `onChat` was called with a two-element array: the first is a role:'agent' message with the question text, the second is a role:'user' `source:'desktop'` message with the answer text. Existing `pending.resolve` + `onAgentWaiting(null)` behavior still verified.

## Scope

**In scope:**
- `electron/mobile-bridge/relay-connection.ts` — split `resetStreams` into `resetStreams()` + `resetCryptoStreams()`.
- `mobile/src/transport/relay-ws.transport.ts` — split into `resetAllOnConnect()` + `resetCryptoOnly()`.
- `electron/ipc/phase-handlers.ts` — broadcast Q&A from `USER_RESPONSE` handler.
- Tests as listed.
- Update `docs/superpowers/specs/2026-04-21-relay-ratchet-reset-design.md` — Protocol Invariant step 3 (the `Set own seq = 0` step) is removed; add a note explaining the envelope seq stays tied to the own-WS lifecycle.

**Out of scope:**
- Cloudflare worker changes.
- Protocol envelope shape changes.
- Any change to the on-wire reset-signaling mechanism (still `seq=0 && lastRecvSeq >= 0`).
- The mobile-originated answer path (`sendAnswer` via `sendChat`). It's already working.

## Risks & Open Questions

- **Convergence on simultaneous reconnect.** With the envelope seq not reset on peer-reconnect detection, a simultaneous-reconnect (both peers' WS drop) still works because each side's own WS reconnect does the full reset (including seq=0) while the worker does the same. The receiver-side path now only fires when ONE side reconnected — exactly the case we were trying to handle. No regression.
- **Test for "seq unchanged after peer-reconnect reset".** Reaching into `(conn as any).seq` is a private-field peek, already an accepted pattern in this test file (`lastRecvSeq` is peeked the same way). No new breach.
- **Spec doc diff.** Step 3 removed; the doc's invariant section is updated. Callers referencing the spec should re-read post-fix.
