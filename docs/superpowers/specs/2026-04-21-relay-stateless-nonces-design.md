# Relay Stateless Nonces — Design

**Date:** 2026-04-21
**Status:** Approved for planning
**Supersedes:** `2026-04-21-relay-ratchet-reset-design.md` (Spec B) and the crypto portions of `2026-04-21-mobile-fixes-batch-design.md`.

## Problem

The relay protocol encrypts every peer-to-peer frame with ChaCha20-Poly1305 using a stateful stream cipher (`SendStream` / `RecvStream` in `shared/crypto/secretstream.ts`). The nonce for each frame is derived from a counter that both sides must keep in sync. The receiving side has a sliding window of 8 nonces; once the sender's counter advances more than 8 frames past the receiver's, every subsequent frame fails with `decryption failed: no matching nonce in window`.

This counter-sync invariant has broken three times in production and each fix has uncovered another edge case:

1. **Original (pre-Spec B):** On WS reconnect, nonces drifted apart with no recovery → every frame failed forever after the first drop.
2. **Spec B (2026-04-21):** Added a receiver-side reset triggered by `env.seq === 0 && lastRecvSeq >= 0`. Worked for the reconnecter→peer direction but introduced…
3. **`seqRegression` kick (mobile-fixes-batch):** …zeroing `this.seq` on the receiver side tripped the Cloudflare worker's anti-regression gate. Fixed by splitting the reset into `resetStreams` / `resetCryptoStreams`.
4. **Current production bug (this spec):** When the desktop's WS drops and reconnects but the phone's WS stays up, the desktop resets its `RecvStream` to counter 0 while the phone's `SendStream` keeps climbing. Within about eight phone-originated frames the window overflows, and the desktop logs `[relay-conn] decrypt failed seq=N no matching nonce in window` for every further phone frame.

Underneath all of these is one shared cause: the receive-side state and the send-side state are two separate counters on two separate machines over an unreliable transport, and we have been trying to keep them in sync with ever-more-elaborate signaling.

There is also a latent cryptographic issue: keys are derived deterministically from the long-lived identity pair (`shared/crypto/noise.ts`). On every WS reconnect the stream counter resets to 0, so the pair `(key, counter=0)` repeats across resets with different plaintexts — classic AEAD nonce reuse. The ratchet was never being rotated on reconnect.

## Goals

1. Fix the asymmetric-reconnect decrypt failure permanently.
2. Eliminate the class of bugs where the two sides' crypto state drifts out of sync.
3. Close the latent nonce-reuse vulnerability.
4. Simplify the client code by deleting the reset machinery that has accumulated across three specs.
5. Minimize worker-side changes; keep the worker's existing connection management, anti-replay, and rate-limit logic intact.

## Non-Goals

- Forward secrecy. The current protocol does not have meaningful forward secrecy (keys derived from long-lived identity only). This spec does not add it; a future design can layer a ratchet on top if needed.
- Changes to pairing, identity management, or the `auth` / `authed` handshake.
- Changes to the worker's rate limiting, pending-frame queue, or `peerReconnect` kick-on-reconnect behavior. All stay as-is.
- Backwards compatibility with the current wire format. Both clients ship together; a hard cutover is acceptable.

## Approach

**Replace the stateful stream cipher with a stateless AEAD pattern:** every outbound envelope carries its own 12-byte random nonce. The receiver reads the nonce from the envelope and decrypts with it directly. No counter, no window, no sync.

This deletes an entire category of failure modes. There is no state to drift, no need to signal a "peer reconnected" event over the wire, no need to reset anything on reconnect.

The risk that stateless nonces could collide is cryptographically negligible: ChaCha20-Poly1305 with uniformly random 96-bit nonces has a birthday collision bound of ~2⁴⁸ messages per key. For this application's expected volume (single chat session, thousands of messages over a lifetime), collision probability is ~2⁻⁷². Safe.

## Wire Protocol

`RelayEnvelope` v2 gains one field, `nonce`:

```ts
interface RelayEnvelope {
  v: 2;
  sid: string;
  seq: number;         // monotonic per-connection; keeps its existing roles
  kind: 'data' | 'ctrl';
  nonce: string;       // NEW — base64 of 12 random bytes, unique per envelope
  ct: string;          // base64 of the AEAD ciphertext
}
```

**`seq` keeps its roles unchanged:** per-connection monotonic counter enforced by the worker (`session-do.ts:179-182`), used for replay protection and rate limiting. Client resets `this.seq = 0` on its own WS (re)connect because the worker resets `lastSeq[role] = -1` on accepting a new WS from that role.

**`nonce`** is 12 random bytes generated via `crypto.getRandomValues()` at encrypt time, base64-encoded. The receiver base64-decodes and passes it directly to `chacha20poly1305(key, nonce).decrypt(ct)`.

**Removed from the wire:** no fields removed; the old envelope shape was already `{ v, sid, seq, kind, ct }`.

## Crypto Layer

**New module `shared/crypto/aead.ts`:**

```ts
import { chacha20poly1305 } from '@noble/ciphers/chacha';

export function aeadEncrypt(key: Uint8Array, plaintext: Uint8Array): { nonce: Uint8Array; ct: Uint8Array } {
  const nonce = new Uint8Array(12);
  crypto.getRandomValues(nonce);
  const ct = chacha20poly1305(key, nonce).encrypt(plaintext);
  return { nonce, ct };
}

export function aeadDecrypt(key: Uint8Array, nonce: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  return chacha20poly1305(key, nonce).decrypt(ciphertext);
}
```

**Deleted module: `shared/crypto/secretstream.ts`.** The `SendStream`, `RecvStream`, `REKEY_TAG`, and `deriveNextKey` symbols are all retired. `REKEY_TAG` was never invoked in production code.

**Unchanged: `shared/crypto/noise.ts`.** `deriveSessionKeys` still produces a `sendKey` / `recvKey` pair with role-based asymmetry (initiator sends with `a`, responder sends with `b`). Each side now just holds two `Uint8Array` keys directly — no stream object.

## Client Reset Paths

### Desktop — `electron/mobile-bridge/relay-connection.ts`

**Deleted:**

- `resetStreams()`
- `resetCryptoStreams()`
- The listener `this.client.on('connect', () => { this.resetStreams(); this.emit('connect'); })` becomes `this.client.on('connect', () => { this.seq = 0; this.lastRecvSeq = -1; this.emit('connect'); })`.
- The branch in `onRawFrame`:
  ```ts
  if (e.seq === 0 && this.lastRecvSeq >= 0) { this.resetCryptoStreams(); }
  ```

**New fields / behavior:**

- `private sendKey: Uint8Array` and `private recvKey: Uint8Array`, derived once in the constructor from the identity pair. Never re-derived (identity doesn't change over the `RelayConnection` lifetime).
- `sendMessage` uses `aeadEncrypt(this.sendKey, plain)` and writes the resulting `nonce` (base64) into the envelope alongside `ct`.
- `onRawFrame` reads `env.nonce`, base64-decodes, and calls `aeadDecrypt(this.recvKey, nonce, ct)`. Decrypt failures still log and drop the frame — but they should now be genuinely rare (only malicious traffic, not counter drift).

### Phone — `mobile/src/transport/relay-ws.transport.ts`

**Deleted:**

- `resetAllOnConnect()`
- `resetCryptoOnly()`
- The branch in `handleRaw`:
  ```ts
  if (env.seq === 0 && this.lastRecvSeq >= 0) { this.resetCryptoOnly(); }
  ```

**New fields / behavior:**

- `private sendKey: Uint8Array` and `private recvKey: Uint8Array`, derived once in the constructor.
- `connect()` still sets `this.seq = 0; this.lastRecvSeq = -1` before opening the WS (needed for worker's anti-replay gate on fresh `lastSeq[role] = -1`).
- `sendEnvelopedEncrypted` uses `aeadEncrypt(this.sendKey, plain)` and attaches the nonce to the envelope.
- `handleRaw` base64-decodes `env.nonce` and calls `aeadDecrypt(this.recvKey, nonce, ct)`. Decrypt failure still closes the WS (consistent with current behavior; the close triggers a fresh reconnect and `this.seq = 0`, which satisfies the worker's anti-replay gate).

### What each side does on reconnect now

1. Open WS (desktop via HTTP Bearer header, phone via subprotocol token).
2. Set `this.seq = 0` and `this.lastRecvSeq = -1`.
3. Start sending and receiving normally — crypto works regardless of what the peer's state is, because nonces are self-describing.

No handshake, no `seq=0` signaling, no window.

## Worker

**`relay/src/envelope.ts`:** `parseEnvelope` validates the new `nonce` field the same way it validates `ct`:
- Must be a string.
- Must be valid base64.
- Decoded byte length must be exactly 12.
- Missing or malformed `nonce` → `parseEnvelope` returns null → worker closes with `1008 'malformed'` (same path as today).

**`relay/src/session-do.ts`:** no logic changes. The worker never inspected crypto state and still doesn't. The `peerReconnect` kick-on-reconnect mechanism (`session-do.ts:98-115`) stays; its prior rationale ("force encryption streams to reset in lockstep") no longer applies, but it still provides useful "last one wins per role" semantics and clears stale `lastSeq` / `rate` / pending-queue state. The comment block at `session-do.ts:98-101` is updated to reflect the new rationale.

## Testing

**New:**

- `shared/crypto/__tests__/aead.test.ts`:
  - Encrypt then decrypt returns the original plaintext.
  - Wrong key throws.
  - Flipped bit in ciphertext throws (tamper detection via Poly1305 MAC).
  - Two successive `aeadEncrypt` calls with the same plaintext produce different nonces and different ciphertexts.
  - `aeadDecrypt` with a wrong-length nonce throws (or `chacha20poly1305` does).

**Modified:**

- `electron/mobile-bridge/__tests__/relay-connection.test.ts`:
  - Remove the tests that exercised `resetCryptoStreams()` and the `seq=0 peer-reconnect` branch (both are deleted).
  - Add a regression test for the production bug: drive the phone-side sender to a high `seq` (e.g., 50) with a high internal nonce, then drop and re-create the desktop's underlying `RelayClient` WS, then assert that the next phone→desktop envelope decrypts cleanly. (With stateless nonces, this passes trivially — which is the whole point. The test documents the fix.)
  - Keep the `auth → authed` and `getPhaseHistory` tests; update them to the new nonce-in-envelope shape.

- `mobile/src/__tests__/relay-ws.transport.test.ts`:
  - Remove the `resetAllOnConnect` / `resetCryptoOnly` split tests.
  - Add the symmetric regression test from the phone's perspective.

- `relay/src/__tests__/envelope.test.ts`:
  - Add cases: valid `nonce`, missing `nonce`, wrong-type `nonce`, malformed base64, decoded length ≠ 12.

- Integration test (extend `electron/mobile-bridge/__tests__/ws-server.integration.test.ts` or a relay-level integration test if one exists) covering the full asymmetric-reconnect scenario end-to-end: desktop WS drops and reconnects while phone keeps sending; assert zero decrypt failures across a burst of 20+ phone→desktop frames.

**Deleted:**

- `shared/crypto/__tests__/secretstream.test.ts` if present — the module it tested is gone.

## Migration

Both clients ship together in the same app bundle; the worker is ours. We do a hard cutover on merge — no dual-format support.

- Worker must be deployed **before or simultaneously with** the client cutover, because an old-format envelope (no `nonce`) reaching the new worker will be rejected as malformed. Conversely, a new-format envelope (with `nonce`) reaching the old worker is accepted (old worker ignores unknown fields) but old-worker-connected peers on the receiving side can't decrypt because they expect the old counter-based nonce.
- Practical order: deploy the new worker first (it accepts the new field, and still forwards old-format frames unchanged — old clients keep working while the worker is new but clients aren't yet), then release the app update to both desktop and phone.

## Scope

**In scope:**

- New module `shared/crypto/aead.ts`.
- Delete `shared/crypto/secretstream.ts` and its tests.
- Update `shared/types.ts` — add `nonce: string` to `RelayEnvelope`.
- Update `electron/mobile-bridge/relay-connection.ts` — remove reset paths, switch to stateless AEAD, cache derived keys.
- Update `mobile/src/transport/relay-ws.transport.ts` — same.
- Update `relay/src/envelope.ts` — parse + validate `nonce`.
- Update `relay/src/session-do.ts` — comment refresh only; no logic change.
- Test updates as listed above.
- Mark the two superseded spec docs at the top.

**Out of scope:**

- Forward secrecy / key rotation.
- Auth or pairing changes.
- Worker logic changes beyond envelope parsing.
- Any mobile UI or chat-layer changes.

## Risks & Open Questions

- **Nonce collision probability:** computed above — negligible for this app. Documented in the spec so a future reviewer doesn't re-ask.
- **`crypto.getRandomValues` availability:** present in all modern browsers, React Native's `react-native-get-random-values` polyfill (already in the mobile build for `@noble/curves`), Node ≥ 15, and Cloudflare Workers. The worker never calls it (no encryption on the worker), so that branch is irrelevant.
- **Forward-port risk:** any in-flight PR that touches `SendStream` / `RecvStream` will need rebasing. Low — the crypto module is small and not actively churned.
- **Bundle size:** removing `secretstream.ts` is a net reduction. `aeadEncrypt` / `aeadDecrypt` are thin wrappers.
- **Hidden consumers of `SendStream` / `RecvStream`:** none expected outside the two relay transports and their tests. Verified via grep before implementation.
