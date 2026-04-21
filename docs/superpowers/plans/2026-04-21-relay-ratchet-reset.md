# Relay Ratchet Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make crypto-stream reset a function of the wire (envelope `seq=0` after an active session), not the WebSocket lifecycle — so a single-side relay reconnect recovers within one round-trip instead of losing the first batch of messages and forcing a second reconnect loop.

**Architecture:** Add one conditional to each receiver's envelope handler: if `env.seq === 0 && lastRecvSeq >= 0`, reset own send + recv streams + seq counter before decrypting. The existing `auth → authed + snapshot` handshake then succeeds on the first reconnect attempt, and snapshot rehydrate re-delivers state. No protocol version bump. Cloudflare Worker and `crypto_secretstream` primitives unchanged.

**Tech Stack:** TypeScript, Electron main (`crypto_secretstream` via `shared/crypto/secretstream`), Expo mobile (React Native WebSocket), Vitest for electron tests, Jest for mobile tests.

**Spec:** `docs/superpowers/specs/2026-04-21-relay-ratchet-reset-design.md`

---

## File Structure

**Desktop (Electron main process):**
- Modify: `electron/mobile-bridge/relay-connection.ts` — new seq=0 branch inside `onRawFrame` that calls the existing private `resetStreams()` before the replay-check line.
- Test: `electron/mobile-bridge/__tests__/relay-connection.test.ts` — extend with two new unit tests exercising the reset branch.

**Mobile (Expo):**
- Modify: `mobile/src/transport/relay-ws.transport.ts` — extract `resetCryptoStreams()` from `connect()` into a private helper; insert seq=0 branch inside `handleRaw`.
- Test: `mobile/src/__tests__/relay-ws.transport.test.ts` — **new file** covering the reset branch with a `FakeWebSocket` harness mirroring the pattern from `lan-ws.transport.test.ts`.

**Integration:**
- Test: `electron/mobile-bridge/__tests__/relay-reconnect.integration.test.ts` — **new file** wiring a live `RelayConnection` to a shadow peer (using the desktop-side primitives — `SendStream`/`RecvStream` — to simulate a phone) through a scripted in-memory WebSocket. Exercises the scenario from the production log: send frames, drop only one side, reconnect, send another frame, assert delivery on first attempt.

---

## Task 1: Desktop — seq=0 reset in RelayConnection.onRawFrame

**Files:**
- Modify: `electron/mobile-bridge/relay-connection.ts:113-133` (`onRawFrame` body)
- Test: `electron/mobile-bridge/__tests__/relay-connection.test.ts` (append two new `it` cases)

**Intent:** Receive the first post-reconnect envelope (`seq=0` after we've accepted at least one frame in the current session), reset the streams in lockstep with the peer, then decrypt as normal.

- [ ] **Step 1: Write the first failing test**

Append to `electron/mobile-bridge/__tests__/relay-connection.test.ts` (top-level, inside the existing `describe('RelayConnection', ...)` block, after the current last `it`):

```ts
  // ── seq=0 peer-reconnect reset ──

  it('resets streams on envelope seq=0 after active session (peer reconnected)', async () => {
    const { deriveSessionKeys } = await import('../../../shared/crypto/noise');
    const { SendStream, RecvStream } = await import('../../../shared/crypto/secretstream');
    const { encodeV2 } = await import('../../../shared/protocol/mobile');

    const desktop = makeDesktop();
    const device = makeDevice();

    const conn = new RelayConnection({ desktop, device });

    // We need to feed raw envelope JSON into the private onRawFrame. The
    // constructor wires it to client 'message' events; simulate by invoking
    // (conn as any).onRawFrame directly — the private method is the unit
    // under test.
    const onRaw = (conn as any).onRawFrame.bind(conn) as (raw: string) => void;

    // Step A: drive lastRecvSeq forward with two legitimate frames encrypted
    // under the ORIGINAL peer stream (peer = phone; identity priv = the
    // device's phonePriv derived in makeDevice).
    // To encrypt as the peer, we need the peer's X25519 priv — makeDevice
    // stores it in the device fields via the helper, but we need direct access.
    // Regenerate deterministically: we re-create the full setup here.
    const { x25519 } = await import('@noble/curves/ed25519');
    const phonePriv = x25519.utils.randomPrivateKey();
    const phonePub = x25519.getPublicKey(phonePriv);
    const device2 = makeDevice({
      phoneIdentityPub: Buffer.from(phonePub).toString('base64'),
    });
    const conn2 = new RelayConnection({ desktop, device: device2 });
    const onRaw2 = (conn2 as any).onRawFrame.bind(conn2) as (raw: string) => void;
    const received: string[] = [];
    conn2.on('message', (m: any) => received.push(m.type));

    // Phone-side send stream keyed to match desktop's recv (role='responder'
    // on desktop means 'initiator' here for phone).
    function makePhoneSend() {
      const keys = deriveSessionKeys(phonePriv, desktop.pub, 'initiator');
      return new SendStream(keys.sendKey);
    }
    let phoneSend = makePhoneSend();

    function encFrame(seq: number, msg: any, sendStream = phoneSend): string {
      const plain = new TextEncoder().encode(encodeV2(msg));
      const ct = sendStream.encrypt(plain);
      return JSON.stringify({
        v: 2, sid: device2.sid!, seq, kind: 'data',
        ct: Buffer.from(ct).toString('base64'),
      });
    }

    // Frames 0 and 1 from the original session
    onRaw2(encFrame(0, { type: 'heartbeat', v: 2 }));
    onRaw2(encFrame(1, { type: 'heartbeat', v: 2 }));
    expect(received).toEqual(['heartbeat', 'heartbeat']);
    expect((conn2 as any).lastRecvSeq).toBe(1);

    // Step B: simulate peer reconnect — fresh SendStream on the phone side,
    // send seq=0 again. Desktop should reset and decode the new frame.
    phoneSend = makePhoneSend();
    onRaw2(encFrame(0, { type: 'heartbeat', v: 2 }));

    expect(received).toEqual(['heartbeat', 'heartbeat', 'heartbeat']);
    expect((conn2 as any).lastRecvSeq).toBe(0);
  });

  it('does not reset on initial seq=0 (fresh session, lastRecvSeq=-1)', async () => {
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
    const received: string[] = [];
    conn.on('message', (m: any) => received.push(m.type));

    const keys = deriveSessionKeys(phonePriv, desktop.pub, 'initiator');
    const sendStream = new SendStream(keys.sendKey);

    const plain = new TextEncoder().encode(encodeV2({ type: 'heartbeat', v: 2 }));
    const ct = sendStream.encrypt(plain);
    const env = JSON.stringify({
      v: 2, sid: device.sid!, seq: 0, kind: 'data',
      ct: Buffer.from(ct).toString('base64'),
    });

    // Initial frame at seq=0, lastRecvSeq is still -1 → no reset should fire
    // and the frame should decrypt under the constructor-initialized stream.
    onRaw(env);
    expect(received).toEqual(['heartbeat']);
    expect((conn as any).lastRecvSeq).toBe(0);
  });
```

Note: the tests reach into private fields (`lastRecvSeq`) and methods (`onRawFrame`) via `as any` casts. This matches existing test patterns for tightly-coupled units and is acceptable here — the unit under test is the receive pipeline, not a public API.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run electron/mobile-bridge/__tests__/relay-connection.test.ts`
Expected: the first new test (`'resets streams on envelope seq=0 after active session'`) FAILS because the existing `onRawFrame` rejects `seq=0` with `lastRecvSeq=1` as replay. The second new test should PASS as-is (the initial-seq=0 path already works).

- [ ] **Step 3: Implement the reset branch**

Edit `electron/mobile-bridge/relay-connection.ts`. Locate `onRawFrame` at line 113 and insert the new branch just before the replay check at line 123. The final body of `onRawFrame` must read exactly:

```ts
  private onRawFrame(raw: string): void {
    let env: unknown;
    try {
      env = JSON.parse(raw);
    } catch {
      return;
    }
    if (!env || typeof env !== 'object') return;
    const e = env as Partial<RelayEnvelope>;
    if (e.v !== 2 || e.sid !== this.sid || typeof e.seq !== 'number' || typeof e.ct !== 'string') return;

    // Peer-reconnect signal: seq=0 after we've already received non-negative
    // seqs means the peer's WS dropped and reconnected, so its send stream
    // is fresh. Reset our streams in lockstep before attempting to decrypt.
    if (e.seq === 0 && this.lastRecvSeq >= 0) {
      this.resetStreams();
    }

    if (e.seq <= this.lastRecvSeq) return; // replay / out-of-order
    this.lastRecvSeq = e.seq;
    try {
      const ct = new Uint8Array(Buffer.from(e.ct, 'base64'));
      const plain = this.recv.decrypt(ct);
      const msg = decodeV2(new TextDecoder().decode(plain));
      if (msg) this.emit('message', msg, this.deviceId);
    } catch (err) {
      console.warn('[relay-conn]', this.deviceId, 'decrypt failed seq=', e.seq, (err as Error).message);
    }
  }
```

No other changes to the file.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run electron/mobile-bridge/__tests__/relay-connection.test.ts`
Expected: all tests pass (existing cases + two new cases).

Run the full suite for safety: `npx vitest run`
Expected: all green (baseline + 2 new tests).

- [ ] **Step 5: Commit**

```bash
git add electron/mobile-bridge/relay-connection.ts electron/mobile-bridge/__tests__/relay-connection.test.ts
git commit -m "feat(relay-conn): reset streams on envelope seq=0 after active session"
```

---

## Task 2: Phone — extract resetCryptoStreams + seq=0 reset in handleRaw

**Files:**
- Modify: `mobile/src/transport/relay-ws.transport.ts:68-104` (`connect()` key-derivation block) and `:167-214` (`handleRaw`)
- Test: `mobile/src/__tests__/relay-ws.transport.test.ts` (new file)

**Intent:** Symmetric to Task 1 on the phone side. First extract the inline key-derivation + stream instantiation into a private `resetCryptoStreams()` helper, then add the same seq=0-after-active-session branch inside `handleRaw`.

- [ ] **Step 1: Write the failing test**

Create `mobile/src/__tests__/relay-ws.transport.test.ts`:

```ts
import { RelayWsTransport } from '../transport/relay-ws.transport';
import { x25519 } from '@noble/curves/ed25519';
import { deriveSessionKeys } from '@shared/crypto/noise';
import { SendStream } from '@shared/crypto/secretstream';
import { encodeV2 } from '@shared/protocol/mobile';
import type { MobileMessageV2 } from '@shared/types';

class FakeWebSocket {
  public readyState = 0;
  public sent: (string | Uint8Array)[] = [];
  public onopen: ((ev: any) => void) | null = null;
  public onmessage: ((ev: { data: unknown }) => void) | null = null;
  public onclose: ((ev: { code?: number; reason?: string }) => void) | null = null;
  public onerror: ((ev: any) => void) | null = null;
  constructor(public url: string, public protocol?: string) {}
  send(data: string | Uint8Array) { this.sent.push(data); }
  close() { this.readyState = 3; this.onclose?.({ code: 1000 }); }
  simulateOpen() { this.readyState = 1; this.onopen?.({}); }
  simulateStringMessage(s: string) { this.onmessage?.({ data: s }); }
}

let lastSocket: FakeWebSocket | null = null;
(globalThis as any).WebSocket = class extends FakeWebSocket {
  constructor(url: string, protocol?: string) { super(url, protocol); lastSocket = this; }
};

function b64(u: Uint8Array): string {
  return Buffer.from(u).toString('base64');
}

function makeSetup() {
  const desktopPriv = x25519.utils.randomPrivateKey();
  const desktopPub = x25519.getPublicKey(desktopPriv);
  const phonePriv = x25519.utils.randomPrivateKey();
  const phonePub = x25519.getPublicKey(phonePriv);
  const device = {
    deviceId: 'd1', deviceToken: 't1',
    identityPriv: b64(phonePriv),
    desktopIdentityPub: b64(desktopPub),
    sid: 'SID',
  };
  // Desktop-side SendStream (keyed to match what phone's recv expects).
  function freshDesktopSend() {
    const keys = deriveSessionKeys(desktopPriv, phonePub, 'responder');
    return new SendStream(keys.sendKey);
  }
  return { device, freshDesktopSend };
}

function encFrame(sendStream: SendStream, sid: string, seq: number, msg: MobileMessageV2): string {
  const plain = new TextEncoder().encode(encodeV2(msg));
  const ct = sendStream.encrypt(plain);
  return JSON.stringify({ v: 2, sid, seq, kind: 'data', ct: b64(ct) });
}

describe('RelayWsTransport — seq=0 peer-reconnect reset', () => {
  beforeEach(() => { lastSocket = null; });

  it('resets crypto streams when an incoming envelope has seq=0 after an active session', async () => {
    const { device, freshDesktopSend } = makeSetup();
    const t = new RelayWsTransport({ device, token: 'fake-token' });
    const messages: MobileMessageV2[] = [];
    t.on('message', (m) => messages.push(m));
    t.connect();
    lastSocket!.simulateOpen();

    // Desktop-side fresh SendStream for the first session.
    let desktopSend = freshDesktopSend();

    // Send the initial `authed` frame so the transport finishes its auth
    // handshake and is in the 'connected' state. The snapshot shape uses the
    // post-per-session-pairing SessionSnapshot contract.
    const authed: MobileMessageV2 = {
      type: 'authed', v: 2,
      snapshot: {
        sessionActive: true,
        sessionId: 'p',
        desktopName: 'D',
        phase: 'idle',
        startedAt: 1,
        activeAgentId: null,
        characters: [],
        chatTail: [],
        sessionEnded: false,
      },
    };
    lastSocket!.simulateStringMessage(encFrame(desktopSend, device.sid, 0, authed));

    // Drive lastRecvSeq forward with a normal frame
    lastSocket!.simulateStringMessage(encFrame(desktopSend, device.sid, 1, { type: 'heartbeat', v: 2 }));
    expect(messages.map((m) => m.type)).toContain('snapshot');

    // Simulate desktop reconnecting: fresh SendStream, new frame at seq=0.
    desktopSend = freshDesktopSend();
    const afterReconnect: MobileMessageV2 = { type: 'heartbeat', v: 2 };
    const beforeCount = messages.length;
    lastSocket!.simulateStringMessage(encFrame(desktopSend, device.sid, 0, afterReconnect));

    // The transport should have reset its recv stream and decoded the frame.
    // Heartbeats are handled internally (don't surface to 'message' listeners),
    // so we assert by side-effect: message listeners did NOT receive a new
    // surface message but the transport also did not close on decrypt
    // failure (readyState still 1).
    expect(lastSocket!.readyState).toBe(1);
    expect(messages.length).toBe(beforeCount); // no new surface message (heartbeat is internal)
  });

  it('does not reset on initial seq=0 (fresh transport)', async () => {
    const { device, freshDesktopSend } = makeSetup();
    const t = new RelayWsTransport({ device, token: 'fake-token' });
    const messages: MobileMessageV2[] = [];
    t.on('message', (m) => messages.push(m));
    t.connect();
    lastSocket!.simulateOpen();

    // First frame at seq=0 should decrypt under the constructor-initialized
    // streams without triggering a reset (lastRecvSeq is still -1 at this
    // point).
    const desktopSend = freshDesktopSend();
    const authed: MobileMessageV2 = {
      type: 'authed', v: 2,
      snapshot: {
        sessionActive: true,
        sessionId: 'p', desktopName: 'D', phase: 'idle', startedAt: 1,
        activeAgentId: null, characters: [], chatTail: [], sessionEnded: false,
      },
    };
    lastSocket!.simulateStringMessage(encFrame(desktopSend, device.sid, 0, authed));
    expect(messages.map((m) => m.type)).toContain('snapshot');
    expect(lastSocket!.readyState).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npx jest src/__tests__/relay-ws.transport.test.ts`
Expected: the first new test FAILS (decrypt error on the post-reconnect seq=0 frame triggers `ws?.close()`, so `readyState` becomes 3, not 1). The second test PASSES.

- [ ] **Step 3: Implement — extract helper and add reset branch**

Edit `mobile/src/transport/relay-ws.transport.ts`.

First, add the new private method `resetCryptoStreams()` just before `private emitStatus(...)` at line 143. Place it after `disconnect()` / `send()` / `on()` cluster:

```ts
  private resetCryptoStreams(): void {
    const priv = b64decode(this.opts.device.identityPriv);
    const desktopPub = b64decode(this.opts.device.desktopIdentityPub);
    const keys = deriveSessionKeys(priv, desktopPub, 'initiator');
    this.sendStream = new SendStream(keys.sendKey);
    this.recvStream = new RecvStream(keys.recvKey);
    this.seq = 0;
    this.lastRecvSeq = -1;
  }
```

Second, replace the inline key-derivation block inside `connect()` (currently lines 71-81) with a call to the helper. The new `connect()` head should read:

```ts
  connect(): void {
    if (this.fatalReason) return;
    this.clearReconnect();
    this.resetCryptoStreams();
    this.emitStatus({ state: 'connecting' });

    try {
      // Phone uses the subprotocol to carry the auth token (RN WebSocket won't
      // send arbitrary Authorization headers).
      const protocol = `token.${this.opts.token}`;
      const wsUrl = `${RELAY_URL}/s/${this.opts.device.sid}`;
      console.log('[relay-ws] opening', wsUrl);
      this.ws = new WebSocket(wsUrl, protocol);
    } catch (err) {
      console.log('[relay-ws] open threw', (err as Error).message);
      this.emitStatus({ state: 'error', error: err as Error });
      this.scheduleReconnect();
      return;
    }
    // ... rest of connect() unchanged ...
  }
```

Third, insert the seq=0 branch in `handleRaw` just before the replay check at line 183. The relevant middle portion of `handleRaw` should read:

```ts
    let env: any;
    try { env = JSON.parse(text); } catch { return; }
    if (env?.v !== 2 || env.sid !== this.opts.device.sid
        || typeof env.seq !== 'number' || typeof env.ct !== 'string') return;

    // Peer-reconnect signal: seq=0 after we've already received non-negative
    // seqs means the desktop's WS dropped and reconnected, so its send stream
    // is fresh. Reset our streams in lockstep before attempting to decrypt.
    if (env.seq === 0 && this.lastRecvSeq >= 0) {
      this.resetCryptoStreams();
    }

    if (env.seq <= this.lastRecvSeq) return; // dedup
    this.lastRecvSeq = env.seq;

    let msg: MobileMessageV2 | null;
    try {
      const ct = b64decode(env.ct);
      const plain = this.recvStream.decrypt(ct);
      msg = decodeV2(new TextDecoder().decode(plain));
    } catch (err) {
      console.log('[relay-ws] decrypt failed', (err as Error).message);
      try { this.ws?.close(); } catch { /* ignore */ }
      return;
    }
    // ... rest of handleRaw unchanged ...
```

**Important:** after `resetCryptoStreams()` is called, `this.recvStream` is non-null. The existing guard at the top of `handleRaw` (`if (!this.recvStream) return;`) still applies and still protects pre-connect calls. No other changes needed.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npx jest src/__tests__/relay-ws.transport.test.ts`
Expected: both tests pass.

Full mobile suite: `cd mobile && npx jest`
Expected: 46 green (44 baseline + 2 new).

Also verify the helper refactor didn't break anything in the existing transport:
Run: `cd mobile && npx tsc --noEmit 2>&1 | grep "relay-ws\|lan-ws\|composite" | head`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/transport/relay-ws.transport.ts mobile/src/__tests__/relay-ws.transport.test.ts
git commit -m "feat(relay-ws-transport): reset streams on envelope seq=0 after active session"
```

---

## Task 3: End-to-end regression test exercising the reported bug scenario

**Files:**
- Test: `electron/mobile-bridge/__tests__/relay-reconnect.integration.test.ts` (new file)

**Intent:** Lock in the behavior with a higher-level test than Task 1's unit assertions. The test constructs a real `RelayConnection`, skips the WebSocket entirely, and drives messages through the underlying `RelayClient` event emitter (which is what the `ws` library would call in production). Verifies a peer reconnect — fresh `SendStream` + `seq=0` — is transparently recovered.

We don't fully wire up a live phone-side `RelayWsTransport` in the same test because their WebSocket globals live in different module systems (Node `ws` vs. RN global). Task 2's unit test already covers the phone side with a `FakeWebSocket`. This test covers the desktop receive pipeline end-to-end through the event emitter.

- [ ] **Step 1: Write the test**

Create `electron/mobile-bridge/__tests__/relay-reconnect.integration.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { x25519, ed25519 } from '@noble/curves/ed25519';
import { RelayConnection } from '../relay-connection';
import { deriveSessionKeys } from '../../../shared/crypto/noise';
import { SendStream } from '../../../shared/crypto/secretstream';
import { encodeV2 } from '../../../shared/protocol/mobile';
import type { MobileMessageV2, PairedDevice } from '../../../shared/types';

function b64(u: Uint8Array): string {
  return Buffer.from(u).toString('base64');
}

function makeKeys() {
  const desktopPriv = x25519.utils.randomPrivateKey();
  const desktopPub = x25519.getPublicKey(desktopPriv);
  const phonePriv = x25519.utils.randomPrivateKey();
  const phonePub = x25519.getPublicKey(phonePriv);
  const pairSignPriv = ed25519.utils.randomPrivateKey();
  const pairSignPub = ed25519.getPublicKey(pairSignPriv);
  return { desktopPriv, desktopPub, phonePriv, phonePub, pairSignPriv, pairSignPub };
}

function makeDevice(keys: ReturnType<typeof makeKeys>): PairedDevice {
  return {
    deviceId: 'd1',
    deviceName: 'iPhone',
    deviceTokenHash: 'h',
    pairedAt: 1,
    lastSeenAt: 1,
    phoneIdentityPub: b64(keys.phonePub),
    pairSignPriv: b64(keys.pairSignPriv),
    pairSignPub: b64(keys.pairSignPub),
    sid: 'SID',
    remoteAllowed: true,
    epoch: 1,
  };
}

function freshPhoneSend(keys: ReturnType<typeof makeKeys>) {
  const sessionKeys = deriveSessionKeys(keys.phonePriv, keys.desktopPub, 'initiator');
  return new SendStream(sessionKeys.sendKey);
}

function encEnvelope(sid: string, seq: number, msg: MobileMessageV2, sendStream: SendStream): string {
  const plain = new TextEncoder().encode(encodeV2(msg));
  const ct = sendStream.encrypt(plain);
  return JSON.stringify({ v: 2, sid, seq, kind: 'data', ct: b64(ct) });
}

describe('RelayConnection — production bug regression', () => {
  it('recovers from a phone WS drop+reconnect without a second reconnect loop', () => {
    const keys = makeKeys();
    const device = makeDevice(keys);

    const conn = new RelayConnection({
      desktop: { priv: keys.desktopPriv, pub: keys.desktopPub },
      device,
    });

    const received: MobileMessageV2[] = [];
    conn.on('message', (m: MobileMessageV2) => received.push(m));

    // Drive the session by emitting 'message' events on the underlying
    // RelayClient — this is exactly what the `ws` library would do in
    // production after a frame arrives off the wire. Bypassing the WebSocket
    // keeps the test free of networking concerns.
    const client: any = (conn as any).client;

    // Initial connect also fires resetStreams on desktop side (matches
    // production behavior when the ws handshake completes).
    client.emit('connect');

    // Steady-state phone→desktop traffic with a stable SendStream.
    let phoneSend = freshPhoneSend(keys);
    client.emit('message', encEnvelope(device.sid!, 0, { type: 'heartbeat', v: 2 }, phoneSend));
    client.emit('message', encEnvelope(device.sid!, 1, { type: 'heartbeat', v: 2 }, phoneSend));
    expect(received).toHaveLength(2);
    expect((conn as any).lastRecvSeq).toBe(1);

    // Simulate phone's WS drop + reconnect: fresh SendStream, seq back to 0.
    // Note the desktop's WS is NOT re-emitting 'connect' here — we're
    // explicitly testing the case where ONLY the phone reconnected, which
    // is the scenario from the production bug log.
    phoneSend = freshPhoneSend(keys);
    client.emit('message', encEnvelope(device.sid!, 0, { type: 'heartbeat', v: 2 }, phoneSend));

    expect(received).toHaveLength(3);
    expect((conn as any).lastRecvSeq).toBe(0);

    // Subsequent frames under the fresh stream still decode.
    client.emit('message', encEnvelope(device.sid!, 1, { type: 'heartbeat', v: 2 }, phoneSend));
    expect(received).toHaveLength(4);
    expect((conn as any).lastRecvSeq).toBe(1);

    conn.stop();
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run electron/mobile-bridge/__tests__/relay-reconnect.integration.test.ts`
Expected: PASS. This test's value is regression coverage — if a future change drops the seq=0 branch, this test will fail at the `expect(received).toHaveLength(3)` assertion (the post-reconnect frame would be rejected as replay under the old behavior).

Run the full suite: `npx vitest run`
Expected: green (baseline + 2 new from Task 1 + 1 from Task 3).

- [ ] **Step 3: Commit**

```bash
git add electron/mobile-bridge/__tests__/relay-reconnect.integration.test.ts
git commit -m "test(relay-reconnect): regression coverage for phone-only WS drop+reconnect"
```

---

## Task 4: End-to-end validation

**Files:** None — validation only.

- [ ] **Step 1: Run the full suites**

```bash
npx vitest run
cd mobile && npx jest && cd ..
```

Expected counts:
- Root vitest: **761+** (baseline 759 + 2 from Task 1 + 1 from Task 3).
- Mobile jest: **46+** (baseline 44 + 2 from Task 2).

If any test fails, STOP and diagnose — do not proceed.

- [ ] **Step 2: Manual QA against a live paired phone**

Scenario from the production log:

1. Desktop running with a phone paired and connected via Remote (relay mode).
2. In desktop chat, trigger an `AskUserQuestion` flow (start `/imagine` or similar that asks a question).
3. While the question is in flight, simulate a transient network drop on the phone (e.g. toggle airplane mode for 2 seconds).
4. Restore network. Observe phone behavior.

Expected after the fix:
- Phone's WS closes with code 1006, reconnects within ~1 s.
- The `AskUserQuestion` appears on the phone immediately after reconnect (no second reconnect loop, no "decrypt failed" log lines).
- Desktop `chatTail` and phone `chatTail` agree.

Before the fix (baseline behavior to remember): the phone would show two `decrypt failed: no matching nonce in window` log lines before a second reconnect recovered the session.

- [ ] **Step 3: Nothing to commit unless QA surfaces a bug.** If manual QA reveals an edge case, fix it + add a regression test before merging.

---

## Spec Coverage Checklist

| Spec requirement | Task(s) |
|---|---|
| Receiver-side `seq=0` reset detection on desktop | 1 |
| Receiver-side `seq=0` reset detection on phone | 2 |
| Shared `resetCryptoStreams` helper on phone | 2 |
| Existing WS-connect-path reset preserved on both sides | 1 (relies on existing `resetStreams`), 2 (`connect()` now calls the new helper) |
| No protocol version bump, `RelayEnvelope` shape unchanged | 1, 2 (no type changes) |
| No change to Cloudflare Worker / `SessionDO` | All (no files in `relay/` touched) |
| No change to `crypto_secretstream` primitives | All (no files in `shared/crypto/` touched) |
| No change to TTLs / `tokenRefresh` cadence | All (no files in `ws-server.ts`, `token-minter.ts`, `pairing-fsm.ts` touched) |
| Unit test covers seq=0 reset on desktop | 1 |
| Unit test covers seq=0 reset on phone | 2 |
| Unit test confirms initial seq=0 does NOT reset (fresh session) | 1, 2 (both tasks include the guard test) |
| Integration test exercises the bug scenario from production log | 3 |
| Idempotent on simultaneous reconnect of both peers | Implicit — the reset detection is per-receiver; both sides resetting on each other's seq=0 converges to the same clean state |
