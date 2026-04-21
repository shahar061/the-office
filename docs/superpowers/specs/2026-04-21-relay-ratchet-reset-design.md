# Relay Ratchet Reset — Design

**Date:** 2026-04-21
**Status:** Approved for planning

## Problem

When a mobile phone's relay WebSocket drops and reconnects (e.g. a transient network blip), the first reconnect attempt fails to decrypt and loses in-flight messages. Observed symptom: an `AskUserQuestion` event posted by the desktop during the blip does not reach the phone — the phone only recovers after a second reconnect triggered by a `decryption failed: no matching nonce in window` error.

Verified root cause: the `crypto_secretstream` (ChaCha20-Poly1305) send/recv counters are reset on the side whose WS reconnects, but not on the still-connected counterparty. On the phone-dropped path:

1. Phone's WS drops (abnormal close, code 1006).
2. Phone reconnects. `RelayWsTransport.connect()` re-derives session keys and resets counters to 0.
3. Phone sends `auth` with envelope `seq=0`.
4. Desktop's `RelayConnection` still holds the old streams with `lastRecvSeq=N`. Its replay gate (`relay-connection.ts:123`) rejects `seq=0` as an out-of-order frame.
5. Desktop's next outbound frame (e.g. the `AskUserQuestion` event) is encrypted at its old `send` counter. Phone's freshly-reset `recv` stream can't decrypt → the error above.
6. Phone closes the WS on decrypt failure and reconnects again. On the second reconnect, the worker's "kick peer" hack (`session-do.ts:106-115`) has had time to force the desktop's WS to reconnect too, so both sides are now fresh. Auth succeeds and snapshot rehydrate replays state.

The current mitigation — the worker kicking the other peer — is racy and adds a reconnect round-trip before messages flow again.

## Goals

1. Recover from any single-side relay reconnect within **one** round-trip.
2. Keep the existing crypto primitives (`crypto_secretstream`) unchanged.
3. Make ratchet-reset semantics a function of the wire format, not the WS lifecycle.
4. No user-visible message loss after the new `authed + snapshot` handshake lands (snapshot rehydrate covers `waiting`, `chatTail`, `archivedRuns`, character state).

## Non-Goals

- Replacing `crypto_secretstream` with a stateless AEAD (tracked as future Option B).
- Adding a replay buffer for per-message exactly-once delivery (tracked as future Option C).
- Changes to relay token TTLs (15 min for desktop, 24 h for phone — current values remain fine).
- Changes to the Cloudflare Worker / `SessionDO` — the worker's kick-the-peer logic stays as-is for defense in depth.
- Anything unrelated to the relay path: no changes to LAN WS handshake, pairing flow, or snapshot construction.

## Mental Model

Before this spec, "crypto stream reset" is triggered by my own WS connect event. That leaves a blind spot: when the other peer's WS drops and reconnects without my own WS dropping, my counters drift out of sync.

After this spec, "crypto stream reset" is triggered by peer reconnect, detected from the wire itself. Any incoming envelope carrying `seq=0` after we've already accepted frames in the current session means the peer has just reset its counters, so we reset ours to match — then decrypt.

The worker's "kick the other peer" behavior becomes a latency optimization (shortens the recovery window) rather than a correctness requirement.

Invariant: ratchet state is a function of the wire, not the WS lifecycle. Any desync heals within one round-trip.

## Protocol Invariant

The `RelayEnvelope` shape is unchanged:

```ts
interface RelayEnvelope {
  v: 2;
  sid: string;
  seq: number;
  kind: 'data' | 'ctrl';
  ct: string;
}
```

The new rule applies on both receivers:

**If `env.seq === 0` AND `this.lastRecvSeq >= 0`:**

1. Re-derive session keys from the long-lived identity pair using `deriveSessionKeys` with the same role label (`'responder'` on desktop, `'initiator'` on phone).
2. Instantiate fresh `SendStream` and `RecvStream` with those keys (counters at 0).
3. Set own `seq = 0` so the next outbound envelope is a matching reset signal to the peer.
4. Set `lastRecvSeq = -1` so the dedup gate accepts the incoming `seq=0`.
5. Decrypt the envelope with the fresh `recv` stream.

If decrypt still fails after the reset (misbehaving peer), fall back to the existing close-on-decrypt-failure behavior — same as today.

The reset is idempotent. If both peers reconnect simultaneously, both see the other's `seq=0` and both reset. The session converges in one round-trip regardless of which side reconnected first.

## Architecture

```
┌───────────────────────────────────────────────┐
│ Desktop                                        │
│   RelayConnection.onRawFrame(raw)              │
│     parse env                                  │
│     if env.seq===0 && lastRecvSeq>=0:          │
│       resetStreams()   ← NEW branch            │
│     if env.seq <= lastRecvSeq: drop            │
│     decrypt with recv stream                   │
└────────┬──────────────────────────────────────┘
         │  wss (RelayEnvelope JSON)
         │
┌────────▼──────────────────────────────────────┐
│ Cloudflare Worker (SessionDO) — UNCHANGED     │
└────────┬──────────────────────────────────────┘
         │  wss (RelayEnvelope JSON)
         │
┌────────▼──────────────────────────────────────┐
│ Phone                                          │
│   RelayWsTransport.handleRaw(data)             │
│     parse env                                  │
│     if env.seq===0 && lastRecvSeq>=0:          │
│       resetCryptoStreams()   ← NEW branch      │
│     if env.seq <= lastRecvSeq: drop            │
│     decrypt with recv stream                   │
└────────────────────────────────────────────────┘
```

## Desktop Changes

**File:** `electron/mobile-bridge/relay-connection.ts`

The existing private `resetStreams()` (lines 74-80) already does exactly what we need — re-derive keys, re-instantiate streams, zero the seq counters. Reuse it.

`onRawFrame(raw)` gains one conditional inserted before the existing replay check:

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
  // seqs means the peer's WS dropped and reconnected, so its send stream is
  // fresh. Reset our streams in lockstep before attempting to decrypt.
  if (e.seq === 0 && this.lastRecvSeq >= 0) {
    this.resetStreams();
  }

  if (e.seq <= this.lastRecvSeq) return;
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

Nothing else in this file changes. The constructor's `this.client.on('connect', () => this.resetStreams())` stays — it handles the case where the desktop's own WS reconnects.

## Phone Changes

**File:** `mobile/src/transport/relay-ws.transport.ts`

Extract the inline key-derivation + stream instantiation from `connect()` (lines 71-81) into a private helper `resetCryptoStreams()` so the new branch and the WS-connect path share one code path.

`resetCryptoStreams()`:

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

`connect()` replaces its inline block with `this.resetCryptoStreams()` before opening the WebSocket.

`handleRaw(data)` gains the same conditional inserted before the existing replay check:

```ts
private async handleRaw(data: unknown): Promise<void> {
  if (!this.recvStream) return;
  // ... decode to envelope `env` ...
  if (env?.v !== 2 || env.sid !== this.opts.device.sid
      || typeof env.seq !== 'number' || typeof env.ct !== 'string') return;

  if (env.seq === 0 && this.lastRecvSeq >= 0) {
    this.resetCryptoStreams();
  }

  if (env.seq <= this.lastRecvSeq) return;
  this.lastRecvSeq = env.seq;
  // decrypt ...
}
```

The existing close-on-decrypt-failure fallback (line 193) stays as a second-line defense. If a peer misbehaves and sends `seq=0` without really having reset, we fall back to today's recovery path — no regression.

## Worker

**File:** `relay/src/session-do.ts`

No changes this spec. The kick-the-peer-on-new-connect behavior (lines 106-115, with 5-second `recentKicks` cooldown) becomes redundant but remains as a latency optimization — it shortens the recovery window when it fires. Removing it would require re-testing the cooldown logic and deploying a new worker; deferred to a follow-up spec.

## Testing

Three new tests reusing the existing harnesses (vitest for electron, jest for mobile):

1. **Desktop unit** — `electron/mobile-bridge/__tests__/relay-connection.test.ts`
   Construct a `RelayConnection` with fake keys + a fake `RelayClient`. Drive `lastRecvSeq` to 5 by feeding five legitimate frames. Then synthesize a `seq=0` envelope whose ciphertext is produced by a fresh peer `SendStream` (matching the key derivation). Assert the `RelayConnection` emits the decoded message (i.e., it reset streams before attempting decrypt). Also assert that a subsequent `seq=1` frame from the same fresh stream still decodes (post-reset state is consistent).

2. **Phone unit** — `mobile/src/__tests__/relay-ws.transport.test.ts`
   Mirror test. Initialize the transport, advance `lastRecvSeq` by feeding frames through `handleRaw`. Then inject a `seq=0` envelope encrypted with a freshly-derived peer stream. Assert the `message` listener fires with the decoded payload.

3. **Integration** — same file or a new `relay-reconnect.integration.test.ts`
   Wire a `RelayConnection` (desktop) and a `RelayWsTransport` (phone) together via a mock worker (simple in-memory fan-out). Sequence: pair → send 3 data frames desktop→phone → phone authed → desktop sends event → phone receives. Then close only the phone's mock WS and reopen it (without signaling the desktop). Desktop sends another event. Assert the phone receives it on the first attempt (no decrypt-failure close-and-retry loop).

Test 3 is the regression guard for the actual reported bug.

## Scope

**In scope:**
- `electron/mobile-bridge/relay-connection.ts` — new seq=0 branch in `onRawFrame`.
- `mobile/src/transport/relay-ws.transport.ts` — new seq=0 branch in `handleRaw`, extract `resetCryptoStreams()` helper.
- New unit tests on both sides + one integration test.

**Out of scope:**
- Cloudflare Worker (`relay/src/session-do.ts`) — unchanged.
- Token-minter, TTLs, `tokenRefresh` cadence — unchanged.
- `RelayClient` on desktop — unchanged; it already re-mints the token on every connect attempt.
- `crypto_secretstream` primitives in `shared/crypto/` — unchanged.
- Spec A items (sprite gate, portrait `ConnectionPill`, mobile phase switcher) — separate spec.

## Risks & Open Questions

- **Adversarial `seq=0`.** A hostile actor who can inject frames into the relay could send `seq=0` to force a reset on a legitimate peer and potentially mask replay. Mitigation: the injected frame's ciphertext still has to decrypt under the freshly-derived recv stream — which requires knowing the long-lived identity private keys. An attacker without those keys can waste CPU on both peers (they'll reset and fail to decrypt), but cannot inject valid plaintext. Acceptable in the current threat model (same as today).
- **Simultaneous reconnect of both peers.** Both see `seq=0` from the other, both reset. The first post-reset frames from each are encrypted with fresh streams, and each side's already-reset state accepts them. Self-healing.
- **Initial connect.** On the first-ever frame after pairing, `lastRecvSeq = -1`, so the new condition `seq === 0 && lastRecvSeq >= 0` is false. The existing WS-connect-path reset handles initial setup. No change to the pairing handshake.
- **Snapshot rehydrate dependency.** Recovery of lost in-flight state relies on the existing `authed` response carrying a fresh `SessionSnapshot`. If a future message type carries state that isn't reflected in the snapshot, this spec would not recover it — Option C (replay buffer) would. Flagged for awareness; no current message type is affected.
