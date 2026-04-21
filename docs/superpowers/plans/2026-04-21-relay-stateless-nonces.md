# Relay Stateless Nonces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stateful `SendStream`/`RecvStream` ratchet on the relay path with a stateless AEAD pattern where every envelope carries its own 12-byte random nonce, eliminating counter drift as a failure mode and closing the latent nonce-reuse vulnerability on the relay.

**Architecture:** Add a new `shared/crypto/aead.ts` module with `aeadEncrypt` / `aeadDecrypt` wrappers around ChaCha20-Poly1305 (random nonce per encrypt). Add a `nonce: string` field to `RelayEnvelope`. Migrate both relay transports (`electron/mobile-bridge/relay-connection.ts` and `mobile/src/transport/relay-ws.transport.ts`) to the new pattern, deleting the reset-on-reconnect machinery that existed only to keep stream counters in sync. LAN / pairing / rendezvous callers keep using `secretstream.ts` unchanged.

**Tech Stack:** TypeScript, `@noble/ciphers/chacha` (already a dep), vitest (desktop), jest (mobile).

**Spec:** `docs/superpowers/specs/2026-04-21-relay-stateless-nonces-design.md`

---

## File Structure

**Create:**
- `shared/crypto/aead.ts` — `aeadEncrypt` / `aeadDecrypt` wrappers. Single-responsibility: random-nonce AEAD.
- `shared/crypto/__tests__/aead.test.ts` — roundtrip, tamper, wrong-key, nonce uniqueness, length.

**Modify:**
- `shared/types/envelope.ts` — add `nonce: string` to `RelayEnvelope`.
- `relay/src/envelope.ts` — validate `nonce` in `parseEnvelope`.
- `relay/src/__tests__/envelope.test.ts` — new cases for the `nonce` field.
- `relay/src/session-do.ts` — comment refresh only; no logic change.
- `electron/mobile-bridge/relay-connection.ts` — switch to stateless AEAD, delete reset paths, cache keys once.
- `electron/mobile-bridge/__tests__/relay-connection.test.ts` — delete the two tests that exercised the peer-reconnect reset; update the remaining tests to the new envelope shape.
- `electron/mobile-bridge/__tests__/relay-reconnect.integration.test.ts` — rewrite the integration regression to exercise the new stateless path.
- `mobile/src/transport/relay-ws.transport.ts` — same migration as desktop.
- `mobile/src/__tests__/relay-ws.transport.test.ts` — delete the peer-reconnect reset tests; update remaining tests.

**Unchanged:**
- `shared/crypto/secretstream.ts` — still used by LAN, pairing, rendezvous.
- `shared/crypto/noise.ts` — key derivation unchanged.

---

## Task 1: Add `aead.ts` module with tests

**Files:**
- Create: `shared/crypto/aead.ts`
- Create: `shared/crypto/__tests__/aead.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `shared/crypto/__tests__/aead.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { aeadEncrypt, aeadDecrypt } from '../aead';

function randomKey(): Uint8Array {
  const k = new Uint8Array(32);
  crypto.getRandomValues(k);
  return k;
}

describe('aead', () => {
  it('encrypts and decrypts roundtrip', () => {
    const key = randomKey();
    const plaintext = new TextEncoder().encode('hello world');
    const { nonce, ct } = aeadEncrypt(key, plaintext);
    const recovered = aeadDecrypt(key, nonce, ct);
    expect(new TextDecoder().decode(recovered)).toBe('hello world');
  });

  it('throws when decrypting with the wrong key', () => {
    const key = randomKey();
    const wrong = randomKey();
    const { nonce, ct } = aeadEncrypt(key, new Uint8Array([1, 2, 3]));
    expect(() => aeadDecrypt(wrong, nonce, ct)).toThrow();
  });

  it('throws when the ciphertext is tampered', () => {
    const key = randomKey();
    const { nonce, ct } = aeadEncrypt(key, new Uint8Array([1, 2, 3, 4]));
    ct[0] ^= 0xff;
    expect(() => aeadDecrypt(key, nonce, ct)).toThrow();
  });

  it('produces a 12-byte nonce on every call', () => {
    const key = randomKey();
    const { nonce } = aeadEncrypt(key, new Uint8Array([0]));
    expect(nonce.byteLength).toBe(12);
  });

  it('produces different nonces across successive encrypts of the same plaintext', () => {
    const key = randomKey();
    const plaintext = new TextEncoder().encode('repeat');
    const a = aeadEncrypt(key, plaintext);
    const b = aeadEncrypt(key, plaintext);
    expect(Buffer.from(a.nonce)).not.toEqual(Buffer.from(b.nonce));
    expect(Buffer.from(a.ct)).not.toEqual(Buffer.from(b.ct));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run shared/crypto/__tests__/aead.test.ts`

Expected: FAIL with `Cannot find module '../aead'`.

- [ ] **Step 3: Implement the module**

Create `shared/crypto/aead.ts`:

```ts
// shared/crypto/aead.ts — Stateless AEAD wrappers for the relay path.
// Each encrypt produces a fresh random 96-bit nonce that travels with the
// ciphertext; decrypt reads the nonce from the envelope. No counter state,
// no sliding window, no reset dance on reconnect.
//
// Nonce collision probability with random 96-bit nonces is bounded at ~2^-48
// per pair of messages under the same key. For this app's expected volume
// (low-rate chat messages over a single session) collisions are cryptographically
// negligible (<2^-72 over a session lifetime).

import { chacha20poly1305 } from '@noble/ciphers/chacha';

const NONCE_LEN = 12;

export function aeadEncrypt(
  key: Uint8Array,
  plaintext: Uint8Array,
): { nonce: Uint8Array; ct: Uint8Array } {
  const nonce = new Uint8Array(NONCE_LEN);
  crypto.getRandomValues(nonce);
  const ct = chacha20poly1305(key, nonce).encrypt(plaintext);
  return { nonce, ct };
}

export function aeadDecrypt(
  key: Uint8Array,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
): Uint8Array {
  return chacha20poly1305(key, nonce).decrypt(ciphertext);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run shared/crypto/__tests__/aead.test.ts`

Expected: PASS, 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add shared/crypto/aead.ts shared/crypto/__tests__/aead.test.ts
git commit -m "feat(crypto): add stateless AEAD wrappers for relay path"
```

---

## Task 2: Add `nonce` to `RelayEnvelope` + worker envelope parsing

**Files:**
- Modify: `shared/types/envelope.ts`
- Modify: `relay/src/envelope.ts`
- Modify: `relay/src/__tests__/envelope.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace the contents of `relay/src/__tests__/envelope.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseEnvelope } from '../envelope';

// 12 zero bytes, base64-encoded, for the nonce field.
const VALID_NONCE_B64 = Buffer.alloc(12).toString('base64');

describe('parseEnvelope', () => {
  it('returns the envelope on valid input', () => {
    const input = JSON.stringify({
      v: 2, sid: 's1', seq: 0, kind: 'data', nonce: VALID_NONCE_B64, ct: 'AQ==',
    });
    expect(parseEnvelope(input)).toEqual({
      v: 2, sid: 's1', seq: 0, kind: 'data', nonce: VALID_NONCE_B64, ct: 'AQ==',
    });
  });

  it('returns null on invalid JSON', () => {
    expect(parseEnvelope('not json')).toBeNull();
  });

  it('returns null on wrong version', () => {
    expect(parseEnvelope(JSON.stringify({
      v: 1, sid: 's', seq: 0, kind: 'data', nonce: VALID_NONCE_B64, ct: '',
    }))).toBeNull();
  });

  it('returns null on missing fields', () => {
    expect(parseEnvelope(JSON.stringify({ v: 2, sid: 's' }))).toBeNull();
  });

  it('returns null on wrong kind', () => {
    expect(parseEnvelope(JSON.stringify({
      v: 2, sid: 's', seq: 0, kind: 'weird', nonce: VALID_NONCE_B64, ct: '',
    }))).toBeNull();
  });

  it('returns null when nonce is missing', () => {
    expect(parseEnvelope(JSON.stringify({
      v: 2, sid: 's', seq: 0, kind: 'data', ct: '',
    }))).toBeNull();
  });

  it('returns null when nonce is the wrong type', () => {
    expect(parseEnvelope(JSON.stringify({
      v: 2, sid: 's', seq: 0, kind: 'data', nonce: 123, ct: '',
    }))).toBeNull();
  });

  it('returns null when nonce is empty string', () => {
    expect(parseEnvelope(JSON.stringify({
      v: 2, sid: 's', seq: 0, kind: 'data', nonce: '', ct: '',
    }))).toBeNull();
  });

  it('returns null when nonce decodes to the wrong length', () => {
    // 8 bytes base64-encoded — too short for a 12-byte ChaCha20 nonce.
    const shortNonce = Buffer.alloc(8).toString('base64');
    expect(parseEnvelope(JSON.stringify({
      v: 2, sid: 's', seq: 0, kind: 'data', nonce: shortNonce, ct: '',
    }))).toBeNull();
  });

  it('returns null when nonce is not valid base64', () => {
    expect(parseEnvelope(JSON.stringify({
      v: 2, sid: 's', seq: 0, kind: 'data', nonce: '!!!not-b64!!!', ct: '',
    }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run relay/src/__tests__/envelope.test.ts`

Expected: FAIL — the new nonce cases fail because the parser doesn't know the field exists. The happy-path test also fails because the returned object doesn't include `nonce`.

- [ ] **Step 3: Update the type**

Edit `shared/types/envelope.ts` — add `nonce` after `kind`:

```ts
// shared/types/envelope.ts — Outer routing envelope the relay sees.
// The relay reads sid/seq/kind and forwards nonce+ct without decrypting.

export interface RelayEnvelope {
  v: 2;
  sid: string;
  seq: number;
  kind: 'data' | 'ctrl';
  nonce: string;  // base64 of 12 random bytes — ChaCha20-Poly1305 nonce for `ct`
  ct: string;     // base64-encoded ciphertext
}
```

- [ ] **Step 4: Update the parser**

Replace the contents of `relay/src/envelope.ts`:

```ts
// relay/src/envelope.ts — Parse and validate the outer relay envelope.

import type { RelayEnvelope } from '../../shared/types/envelope';

const NONCE_BYTES = 12;

function isValidNonceB64(s: string): boolean {
  if (s.length === 0) return false;
  // Quick charset gate — base64 alphabet only.
  if (!/^[A-Za-z0-9+/]+=*$/.test(s)) return false;
  try {
    const decoded = atob(s);
    return decoded.length === NONCE_BYTES;
  } catch {
    return false;
  }
}

export function parseEnvelope(raw: string): RelayEnvelope | null {
  try {
    const p = JSON.parse(raw);
    if (p?.v !== 2) return null;
    if (typeof p.sid !== 'string' || typeof p.seq !== 'number') return null;
    if (p.kind !== 'data' && p.kind !== 'ctrl') return null;
    if (typeof p.ct !== 'string') return null;
    if (typeof p.nonce !== 'string' || !isValidNonceB64(p.nonce)) return null;
    return p as RelayEnvelope;
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run relay/src/__tests__/envelope.test.ts`

Expected: PASS, 10 tests green.

- [ ] **Step 6: Run full vitest to check for type-check fallout**

Run: `npx vitest run`

Expected: **FAIL.** `relay-connection.ts` and related tests still send envelopes without the `nonce` field, so TypeScript will flag the type mismatch and the existing relay-connection tests will break at runtime. This is expected — we fix it in Tasks 3 and 4. Note the specific failures so you can cross-check them get fixed later.

- [ ] **Step 7: Commit**

```bash
git add shared/types/envelope.ts relay/src/envelope.ts relay/src/__tests__/envelope.test.ts
git commit -m "feat(relay): add nonce field to RelayEnvelope; validate in worker parser"
```

---

## Task 3: Migrate desktop `relay-connection.ts` to stateless AEAD

**Files:**
- Modify: `electron/mobile-bridge/relay-connection.ts`
- Modify: `electron/mobile-bridge/__tests__/relay-connection.test.ts`

- [ ] **Step 1: Delete the now-obsolete tests**

Open `electron/mobile-bridge/__tests__/relay-connection.test.ts`. Delete both of these test blocks (they cover the seq=0 peer-reconnect reset which is being removed) — they start at the `it(...)` lines below:

- `it('resets streams on envelope seq=0 after active session (peer reconnected)', async () => { ... })` — roughly lines 75-122.
- `it('preserves outgoing seq across peer-reconnect reset (seqRegression regression guard)', async () => { ... })` — roughly lines 124-171.

Keep `it('does not reset on initial seq=0 (fresh session, lastRecvSeq=-1)', ...)` but it will need updating in Step 4 to use stateless AEAD.

- [ ] **Step 2: Write the failing new tests**

Append the following test block into `electron/mobile-bridge/__tests__/relay-connection.test.ts` (before the closing `});`) — these exercise the stateless-AEAD path:

```ts
  // ── stateless AEAD decode ──

  it('decodes an envelope that carries its own random nonce', async () => {
    const { deriveSessionKeys } = await import('../../../shared/crypto/noise');
    const { aeadEncrypt } = await import('../../../shared/crypto/aead');
    const { encodeV2 } = await import('../../../shared/protocol/mobile');
    const { x25519 } = await import('@noble/curves/ed25519');

    const desktop = makeDesktop();
    const phonePriv = x25519.utils.randomPrivateKey();
    const phonePub = x25519.getPublicKey(phonePriv);
    const device = makeDevice({ phoneIdentityPub: Buffer.from(phonePub).toString('base64') });
    const conn = new RelayConnection({ desktop, device });
    const onRaw = (conn as any).onRawFrame.bind(conn) as (raw: string) => void;
    const received: any[] = [];
    conn.on('message', (m: any) => received.push(m));

    // Phone-side stateless encrypt using the mirror role key.
    const keys = deriveSessionKeys(phonePriv, desktop.pub, 'initiator');
    const plain = new TextEncoder().encode(encodeV2({ type: 'heartbeat', v: 2 }));
    const { nonce, ct } = aeadEncrypt(keys.sendKey, plain);
    const env = JSON.stringify({
      v: 2, sid: device.sid!, seq: 0, kind: 'data',
      nonce: Buffer.from(nonce).toString('base64'),
      ct: Buffer.from(ct).toString('base64'),
    });

    onRaw(env);
    expect(received.map((m) => m.type)).toEqual(['heartbeat']);
    expect((conn as any).lastRecvSeq).toBe(0);
  });

  it('survives asymmetric reconnect — desktop resets state but phone keeps its high seq (production bug regression)', async () => {
    const { deriveSessionKeys } = await import('../../../shared/crypto/noise');
    const { aeadEncrypt } = await import('../../../shared/crypto/aead');
    const { encodeV2 } = await import('../../../shared/protocol/mobile');
    const { x25519 } = await import('@noble/curves/ed25519');

    const desktop = makeDesktop();
    const phonePriv = x25519.utils.randomPrivateKey();
    const phonePub = x25519.getPublicKey(phonePriv);
    const device = makeDevice({ phoneIdentityPub: Buffer.from(phonePub).toString('base64') });
    const conn = new RelayConnection({ desktop, device });
    const onRaw = (conn as any).onRawFrame.bind(conn) as (raw: string) => void;
    const received: any[] = [];
    conn.on('message', (m: any) => received.push(m));

    const keys = deriveSessionKeys(phonePriv, desktop.pub, 'initiator');

    // Phone sends a burst of 20 envelopes at ever-increasing seq. With the
    // old stream-cipher design, the 9th+ frames would have failed to decrypt
    // after a desktop-side reset because the recv window is 8. With stateless
    // AEAD they all decrypt regardless.
    for (let seq = 0; seq < 20; seq++) {
      const plain = new TextEncoder().encode(encodeV2({ type: 'heartbeat', v: 2 }));
      const { nonce, ct } = aeadEncrypt(keys.sendKey, plain);
      const env = JSON.stringify({
        v: 2, sid: device.sid!, seq, kind: 'data',
        nonce: Buffer.from(nonce).toString('base64'),
        ct: Buffer.from(ct).toString('base64'),
      });
      onRaw(env);
    }

    expect(received).toHaveLength(20);
    expect((conn as any).lastRecvSeq).toBe(19);
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run electron/mobile-bridge/__tests__/relay-connection.test.ts`

Expected: FAIL — the new tests construct envelopes with a `nonce` field, but `relay-connection.ts` still uses `SendStream`/`RecvStream` and doesn't read `env.nonce`. The kept test (`does not reset on initial seq=0`) also fails for the same reason (it was written against the old counter-based nonces).

- [ ] **Step 4: Update the kept test to use stateless AEAD**

Replace the body of `it('does not reset on initial seq=0 (fresh session, lastRecvSeq=-1)', ...)` with:

```ts
  it('decodes an initial seq=0 frame (fresh session, lastRecvSeq=-1)', async () => {
    const { deriveSessionKeys } = await import('../../../shared/crypto/noise');
    const { aeadEncrypt } = await import('../../../shared/crypto/aead');
    const { encodeV2 } = await import('../../../shared/protocol/mobile');
    const { x25519 } = await import('@noble/curves/ed25519');

    const desktop = makeDesktop();
    const phonePriv = x25519.utils.randomPrivateKey();
    const phonePub = x25519.getPublicKey(phonePriv);
    const device = makeDevice({ phoneIdentityPub: Buffer.from(phonePub).toString('base64') });
    const conn = new RelayConnection({ desktop, device });
    const onRaw = (conn as any).onRawFrame.bind(conn) as (raw: string) => void;
    const received: any[] = [];
    conn.on('message', (m: any) => received.push(m));

    const keys = deriveSessionKeys(phonePriv, desktop.pub, 'initiator');
    const plain = new TextEncoder().encode(encodeV2({ type: 'heartbeat', v: 2 }));
    const { nonce, ct } = aeadEncrypt(keys.sendKey, plain);
    const env = JSON.stringify({
      v: 2, sid: device.sid!, seq: 0, kind: 'data',
      nonce: Buffer.from(nonce).toString('base64'),
      ct: Buffer.from(ct).toString('base64'),
    });

    onRaw(env);
    expect(received.map((m) => m.type)).toEqual(['heartbeat']);
    expect((conn as any).lastRecvSeq).toBe(0);
  });
```

- [ ] **Step 5: Migrate `relay-connection.ts` to stateless AEAD**

Replace the contents of `electron/mobile-bridge/relay-connection.ts`:

```ts
// electron/mobile-bridge/relay-connection.ts
// One per remoteAllowed device. Wraps a RelayClient with stateless AEAD +
// envelope serialization. Holds long-lived session keys and a per-connection
// seq counter. No stream-cipher state: every envelope carries its own random
// 12-byte nonce.

import { EventEmitter } from 'events';
import type { MobileMessageV2, PairedDevice, Phase, PhaseHistory, RelayEnvelope } from '../../shared/types';
import { RELAY_URL } from '../../shared/types';
import { encodeV2, decodeV2 } from '../../shared/protocol/mobile';
import { deriveSessionKeys } from '../../shared/crypto/noise';
import { aeadEncrypt, aeadDecrypt } from '../../shared/crypto/aead';
import { RelayClient } from './relay-client';
import { mintToken } from './token-minter';
import type { Identity } from './identity';

function b64decode(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, 'base64'));
}

export class RelayConnection extends EventEmitter {
  private client: RelayClient;
  private readonly sendKey: Uint8Array;
  private readonly recvKey: Uint8Array;
  private seq = 0;
  private lastRecvSeq = -1;
  private readonly sid: string;
  private readonly deviceId: string;
  private readonly pairSignPriv: Uint8Array;
  private readonly epoch: number;
  private phaseHistoryHandler: ((phase: Phase) => PhaseHistory[] | Promise<PhaseHistory[]>) | null = null;

  onPhoneGetPhaseHistory(handler: (phase: Phase) => PhaseHistory[] | Promise<PhaseHistory[]>): void {
    this.phaseHistoryHandler = handler;
  }

  constructor(opts: { desktop: Identity; device: PairedDevice }) {
    super();
    if (
      !opts.device.phoneIdentityPub ||
      !opts.device.pairSignPriv ||
      !opts.device.pairSignPub ||
      !opts.device.sid
    ) {
      throw new Error(`RelayConnection requires v2-paired device; missing fields on ${opts.device.deviceId}`);
    }
    this.deviceId = opts.device.deviceId;
    this.sid = opts.device.sid;
    this.pairSignPriv = b64decode(opts.device.pairSignPriv);
    this.epoch = opts.device.epoch ?? 1;

    const desktopPriv = opts.desktop.priv;
    const phonePub = b64decode(opts.device.phoneIdentityPub);
    const keys = deriveSessionKeys(desktopPriv, phonePub, 'responder');
    this.sendKey = keys.sendKey;
    this.recvKey = keys.recvKey;

    this.client = new RelayClient({
      url: RELAY_URL,
      sid: this.sid,
      mintToken: () =>
        mintToken(this.pairSignPriv, {
          sid: this.sid,
          role: 'desktop',
          epoch: this.epoch,
          ttlMs: 15 * 60_000,
        }),
      pairSignPub: b64decode(opts.device.pairSignPub),
    });

    // On every WS (re)connect, reset our per-connection counters. The worker
    // resets lastSeq[desktop] = -1 on accepting a new WS, so our seq must
    // start at 0 to satisfy the anti-regression gate. Crypto state has no
    // counters anymore — nothing else to reset.
    this.client.on('connect', () => {
      this.seq = 0;
      this.lastRecvSeq = -1;
      this.emit('connect');
    });
    this.client.on('disconnect', () => this.emit('disconnect'));
    this.client.on('error', (err: Error) => this.emit('error', err));
    this.client.on('message', (raw: string) => this.onRawFrame(raw));
  }

  start(): void {
    this.client.start();
  }

  stop(): void {
    this.client.stop();
  }

  isConnected(): boolean {
    return this.client.isConnected();
  }

  /** Encrypt + envelope + send. No-op if not connected. */
  sendMessage(msg: MobileMessageV2, kind: 'data' | 'ctrl' = 'data'): void {
    if (!this.client.isConnected()) return;
    const plain = new TextEncoder().encode(encodeV2(msg));
    const { nonce, ct } = aeadEncrypt(this.sendKey, plain);
    const envelope: RelayEnvelope = {
      v: 2,
      sid: this.sid,
      seq: this.seq++,
      kind,
      nonce: Buffer.from(nonce).toString('base64'),
      ct: Buffer.from(ct).toString('base64'),
    };
    this.client.send(JSON.stringify(envelope));
  }

  getDeviceId(): string {
    return this.deviceId;
  }

  private onRawFrame(raw: string): void {
    let env: unknown;
    try {
      env = JSON.parse(raw);
    } catch {
      return;
    }
    if (!env || typeof env !== 'object') return;
    const e = env as Partial<RelayEnvelope>;
    if (e.v !== 2 || e.sid !== this.sid
        || typeof e.seq !== 'number' || typeof e.ct !== 'string'
        || typeof e.nonce !== 'string') return;

    if (e.seq <= this.lastRecvSeq) return; // replay / out-of-order
    this.lastRecvSeq = e.seq;

    try {
      const nonce = new Uint8Array(Buffer.from(e.nonce, 'base64'));
      const ct = new Uint8Array(Buffer.from(e.ct, 'base64'));
      const plain = aeadDecrypt(this.recvKey, nonce, ct);
      const msg = decodeV2(new TextDecoder().decode(plain));
      if (msg) {
        this.emit('message', msg, this.deviceId);
        if (msg.type === 'getPhaseHistory' && this.phaseHistoryHandler) {
          const handler = this.phaseHistoryHandler;
          const result = handler(msg.phase);
          const sendReply = (history: PhaseHistory[]) => {
            this.sendMessage({
              type: 'phaseHistory', v: 2,
              requestId: msg.requestId, phase: msg.phase, history,
            });
          };
          if (result && typeof (result as Promise<PhaseHistory[]>).then === 'function') {
            (result as Promise<PhaseHistory[]>).then(sendReply).catch((err: Error) => {
              console.warn('[relay-conn]', this.deviceId, 'phase-history handler failed:', err.message);
            });
          } else {
            try {
              sendReply(result as PhaseHistory[]);
            } catch (err) {
              console.warn('[relay-conn]', this.deviceId, 'phase-history handler failed:', (err as Error).message);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[relay-conn]', this.deviceId, 'decrypt failed seq=', e.seq, (err as Error).message);
    }
  }
}
```

- [ ] **Step 6: Run the relay-connection tests**

Run: `npx vitest run electron/mobile-bridge/__tests__/relay-connection.test.ts`

Expected: PASS — all tests (original ones + the two new AEAD ones) green.

- [ ] **Step 7: Run full vitest to check for wider breakage**

Run: `npx vitest run`

Expected: the relay-reconnect integration test (`relay-reconnect.integration.test.ts`) still fails — it imports `SendStream` from secretstream and builds old-shape envelopes. That's fixed in Task 5. Other tests should pass.

- [ ] **Step 8: Commit**

```bash
git add electron/mobile-bridge/relay-connection.ts electron/mobile-bridge/__tests__/relay-connection.test.ts
git commit -m "refactor(relay-conn): migrate desktop relay-connection to stateless AEAD"
```

---

## Task 4: Migrate mobile `relay-ws.transport.ts` to stateless AEAD

**Files:**
- Modify: `mobile/src/transport/relay-ws.transport.ts`
- Modify: `mobile/src/__tests__/relay-ws.transport.test.ts`

- [ ] **Step 1: Read the existing test file**

Open `mobile/src/__tests__/relay-ws.transport.test.ts` and locate:

- The two tests covering `resetAllOnConnect` / `resetCryptoOnly` / peer-reconnect reset behavior (test names mention "peer-reconnect reset" and "preserves outgoing seq"). Delete both test `it(...)` blocks.
- The `encFrame` helper at the top of the file — it still takes a `SendStream` and produces old-shape envelopes. It will need replacing in Step 3.

- [ ] **Step 2: Refactor `makeSetup` so tests can drive stateless AEAD directly**

Replace the existing `makeSetup` helper at the top of `mobile/src/__tests__/relay-ws.transport.test.ts` with:

```ts
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
  // Desktop-side session keys. Keyed to match what phone's recv expects:
  // desktop is the 'responder' in deriveSessionKeys.
  const desktopKeys = deriveSessionKeys(desktopPriv, phonePub, 'responder');
  return { device, desktopKeys };
}
```

Remove the old import of `SendStream` at the top of the test file — no more stream cipher. Also delete the old top-level `encFrame` helper if present; the new tests build envelopes inline (a few lines each, no shared helper needed) so the old one is dead.

The other imports to add near the top of the file (next to the existing `deriveSessionKeys` import):

```ts
import { aeadEncrypt } from '@shared/crypto/aead';
```

- [ ] **Step 3: Write the failing new tests**

Append a new top-level `describe` block to `mobile/src/__tests__/relay-ws.transport.test.ts`:

```ts
describe('RelayWsTransport — stateless AEAD', () => {
  beforeEach(() => { lastSocket = null; jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  function encAead(sendKey: Uint8Array, sid: string, seq: number, msg: MobileMessageV2): string {
    const plain = new TextEncoder().encode(encodeV2(msg));
    const { nonce, ct } = aeadEncrypt(sendKey, plain);
    return JSON.stringify({
      v: 2, sid, seq, kind: 'data',
      nonce: b64(nonce), ct: b64(ct),
    });
  }

  const authedSnapshot = {
    sessionActive: true, sessionId: 'p', desktopName: 'D', phase: 'idle',
    startedAt: 1, activeAgents: [], chatTail: [], events: [],
  } as any;

  it('decodes an envelope that carries its own random nonce', async () => {
    const { device, desktopKeys } = makeSetup();
    const t = new RelayWsTransport({ device, token: 'fake-token' });
    const messages: MobileMessageV2[] = [];
    t.on('message', (m) => messages.push(m));
    t.connect();
    lastSocket!.simulateOpen();

    const authed: MobileMessageV2 = { type: 'authed', v: 2, snapshot: authedSnapshot };
    lastSocket!.simulateStringMessage(encAead(desktopKeys.sendKey, device.sid, 0, authed));

    expect(messages.map((m) => m.type)).toContain('snapshot');
  });

  it('survives asymmetric reconnect — desktop keeps its high seq while phone resets (production bug regression, mirror)', async () => {
    const { device, desktopKeys } = makeSetup();
    const t = new RelayWsTransport({ device, token: 'fake-token' });
    const messages: MobileMessageV2[] = [];
    t.on('message', (m) => messages.push(m));
    t.connect();
    lastSocket!.simulateOpen();

    // First pass auth so the transport is in the 'connected' state.
    const authed: MobileMessageV2 = { type: 'authed', v: 2, snapshot: authedSnapshot };
    lastSocket!.simulateStringMessage(encAead(desktopKeys.sendKey, device.sid, 0, authed));

    // Deliver a burst of 20 state frames at seq 1..20 using the SAME
    // desktop-side key. Under the old 8-wide recv window, frames 9+ would
    // have failed to decrypt. With stateless AEAD all 20 decode cleanly.
    for (let seq = 1; seq <= 20; seq++) {
      const state: MobileMessageV2 = {
        type: 'state', v: 2, state: { typing: false } as any,
      };
      lastSocket!.simulateStringMessage(encAead(desktopKeys.sendKey, device.sid, seq, state));
    }

    const stateMsgs = messages.filter((m) => m.type === 'state');
    expect(stateMsgs).toHaveLength(20);
  });
});
```

(The exact shape of `state` / `snapshot` above may need minor shape fix-ups to match the current `MobileMessageV2` contracts in `shared/types`. If TypeScript complains about a field, cast the literal to `any` — the tests only care that the envelope round-trips through decrypt + `decodeV2`, not that every shape field is faithful.)

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd mobile && npx jest src/__tests__/relay-ws.transport.test.ts`

Expected: FAIL — `@shared/crypto/aead` can't be resolved from within the transport yet (no change to transport, new tests can't construct matching envelopes), or decrypt fails because the transport is still using `SendStream`/`RecvStream`.

- [ ] **Step 5: Migrate `relay-ws.transport.ts` to stateless AEAD**

Replace the contents of `mobile/src/transport/relay-ws.transport.ts`:

```ts
// mobile/src/transport/relay-ws.transport.ts
// Remote-access transport — connects via the Cloudflare Worker relay.
// Frames on the wire are RelayEnvelope JSON. Encryption is stateless AEAD
// (ChaCha20-Poly1305 with a random 96-bit nonce per envelope); no counter
// state, no sliding window, no reset-on-reconnect dance.

import type { MobileMessageV2, SessionSnapshot, RelayEnvelope } from '@shared/types';
import { RELAY_URL } from '@shared/types';
import { decodeV2, encodeV2 } from '@shared/protocol/mobile';
import { deriveSessionKeys } from '@shared/crypto/noise';
import { aeadEncrypt, aeadDecrypt } from '@shared/crypto/aead';
import type { Transport, TransportStatus, TransportEventMap } from './transport.interface';

interface Device {
  deviceId: string;
  deviceToken: string;
  identityPriv: string;         // base64
  desktopIdentityPub: string;   // base64
  sid: string;                  // relay session id
}

interface Options {
  device: Device;
  token: string;                // Ed25519-signed relay token (minted by desktop)
}

const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TIMEOUT_MS = 45_000;
const BACKOFF_SCHEDULE_MS = [1000, 2000, 4000, 8000, 16000, 30000];
const NO_RECONNECT_REASONS = new Set(['unknownDevice', 'revoked']);

function b64decode(s: string): Uint8Array {
  if (typeof globalThis.atob === 'function') {
    const bin = globalThis.atob(s);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  return new Uint8Array(Buffer.from(s, 'base64'));
}

function b64encode(u: Uint8Array): string {
  if (typeof globalThis.btoa === 'function') {
    let s = '';
    for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return globalThis.btoa(s);
  }
  return Buffer.from(u).toString('base64');
}

export class RelayWsTransport implements Transport {
  private ws: WebSocket | null = null;
  private listeners: { [K in keyof TransportEventMap]: Set<TransportEventMap[K]> } = {
    status: new Set(),
    message: new Set(),
  };
  private backoffIdx = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastServerHeartbeat = 0;
  private shouldReconnect = true;
  private fatalReason: string | null = null;
  private readonly sendKey: Uint8Array;
  private readonly recvKey: Uint8Array;
  private seq = 0;
  private lastRecvSeq = -1;

  constructor(private readonly opts: Options) {
    const priv = b64decode(opts.device.identityPriv);
    const desktopPub = b64decode(opts.device.desktopIdentityPub);
    const keys = deriveSessionKeys(priv, desktopPub, 'initiator');
    this.sendKey = keys.sendKey;
    this.recvKey = keys.recvKey;
  }

  connect(): void {
    if (this.fatalReason) return;
    this.clearReconnect();
    // Reset per-connection counters. The worker resets lastSeq[phone] = -1
    // on accepting a new WS, so our seq must start at 0 to satisfy the
    // anti-regression gate. No crypto state to reset — nonces are stateless.
    this.seq = 0;
    this.lastRecvSeq = -1;
    this.emitStatus({ state: 'connecting' });

    try {
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

    this.ws.onopen = () => {
      console.log('[relay-ws] open → sending auth');
      this.sendEnvelopedEncrypted({
        type: 'auth', v: 2,
        deviceId: this.opts.device.deviceId,
        deviceToken: this.opts.device.deviceToken,
      });
    };

    this.ws.onmessage = (ev: { data: unknown }) => this.handleRaw(ev.data);

    this.ws.onclose = (ev: { code?: number; reason?: string } = {}) => {
      this.clearHeartbeat();
      console.log('[relay-ws] close', ev.code, ev.reason ?? '');
      if (this.fatalReason) {
        this.emitStatus({ state: 'disconnected', reason: this.fatalReason });
        return;
      }
      this.emitStatus({ state: 'disconnected', reason: 'socket-close' });
      if (this.shouldReconnect) this.scheduleReconnect();
    };

    this.ws.onerror = (ev: unknown) => {
      console.log('[relay-ws] error', (ev as { message?: string })?.message ?? ev);
      this.emitStatus({ state: 'error', error: new Error('socket error') });
      try { this.ws?.close(); } catch { /* ignore */ }
    };
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.clearReconnect();
    this.clearHeartbeat();
    try { this.ws?.close(); } catch { /* ignore */ }
    this.ws = null;
  }

  send(msg: MobileMessageV2): void {
    this.sendEnvelopedEncrypted(msg);
  }

  on<K extends keyof TransportEventMap>(event: K, handler: TransportEventMap[K]): () => void {
    this.listeners[event].add(handler as any);
    return () => { this.listeners[event].delete(handler as any); };
  }

  private emitStatus(s: TransportStatus) {
    for (const h of this.listeners.status) (h as (s: TransportStatus) => void)(s);
  }

  private emitMessage(m: MobileMessageV2) {
    for (const h of this.listeners.message) (h as (m: MobileMessageV2) => void)(m);
  }

  private sendEnvelopedEncrypted(msg: MobileMessageV2, kind: 'data' | 'ctrl' = 'data'): void {
    if (!this.ws || this.ws.readyState !== 1) return;
    try {
      const plain = new TextEncoder().encode(encodeV2(msg));
      const { nonce, ct } = aeadEncrypt(this.sendKey, plain);
      const env: RelayEnvelope = {
        v: 2,
        sid: this.opts.device.sid,
        seq: this.seq++,
        kind,
        nonce: b64encode(nonce),
        ct: b64encode(ct),
      };
      this.ws.send(JSON.stringify(env));
    } catch { /* ignore */ }
  }

  private async handleRaw(data: unknown): Promise<void> {
    let text: string;
    try {
      if (typeof data === 'string') text = data;
      else if (data instanceof ArrayBuffer) text = new TextDecoder().decode(new Uint8Array(data));
      else if (data instanceof Uint8Array) text = new TextDecoder().decode(data);
      else if (typeof (data as Blob).arrayBuffer === 'function') {
        text = new TextDecoder().decode(new Uint8Array(await (data as Blob).arrayBuffer()));
      } else return;
    } catch { return; }

    let env: any;
    try { env = JSON.parse(text); } catch { return; }
    if (env?.v !== 2 || env.sid !== this.opts.device.sid
        || typeof env.seq !== 'number' || typeof env.ct !== 'string'
        || typeof env.nonce !== 'string') return;

    if (env.seq <= this.lastRecvSeq) return; // dedup
    this.lastRecvSeq = env.seq;

    let msg: MobileMessageV2 | null;
    try {
      const nonce = b64decode(env.nonce);
      const ct = b64decode(env.ct);
      const plain = aeadDecrypt(this.recvKey, nonce, ct);
      msg = decodeV2(new TextDecoder().decode(plain));
    } catch (err) {
      console.log('[relay-ws] decrypt failed', (err as Error).message);
      try { this.ws?.close(); } catch { /* ignore */ }
      return;
    }
    if (!msg) return;

    console.log('[relay-ws] recv', msg.type);
    switch (msg.type) {
      case 'authed': this.onAuthed(msg.snapshot); break;
      case 'authFailed': this.onAuthFailed(msg.reason); break;
      case 'heartbeat':
        this.lastServerHeartbeat = Date.now();
        this.sendEnvelopedEncrypted({ type: 'heartbeat', v: 2 });
        break;
      case 'snapshot':
      case 'event':
      case 'chatFeed':
      case 'chatAck':
      case 'state':
        this.emitMessage(msg);
        break;
    }
  }

  private onAuthed(snapshot: SessionSnapshot) {
    this.backoffIdx = 0;
    this.lastServerHeartbeat = Date.now();
    this.emitStatus({ state: 'connected', desktopName: snapshot.desktopName });
    this.emitMessage({ type: 'snapshot', v: 2, snapshot });
    this.startHeartbeatLoop();
  }

  private onAuthFailed(reason: string) {
    this.emitStatus({ state: 'disconnected', reason });
    if (NO_RECONNECT_REASONS.has(reason)) {
      this.shouldReconnect = false;
      this.fatalReason = reason;
    }
    try { this.ws?.close(); } catch { /* ignore */ }
  }

  private startHeartbeatLoop() {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (Date.now() - this.lastServerHeartbeat > HEARTBEAT_TIMEOUT_MS) {
        try { this.ws?.close(); } catch { /* ignore */ }
        return;
      }
      this.sendEnvelopedEncrypted({ type: 'heartbeat', v: 2 });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private clearHeartbeat() {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
  }

  private scheduleReconnect() {
    const delay = BACKOFF_SCHEDULE_MS[Math.min(this.backoffIdx, BACKOFF_SCHEDULE_MS.length - 1)];
    this.backoffIdx += 1;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private clearReconnect() {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  }
}
```

- [ ] **Step 6: Update tests that were skipped in Step 1**

Some of the existing transport tests (for auth, heartbeat, disconnect) use the old `encFrame` helper and `freshDesktopSend` — both gone after Step 2. Walk through every remaining test in the file and update it to use the new `encAead` helper from the `'RelayWsTransport — stateless AEAD'` describe block above (copy the helper alongside or lift it to module scope). Each test that previously called:

```ts
const desktopSend = freshDesktopSend();
lastSocket!.simulateStringMessage(encFrame(desktopSend, device.sid, 0, msg));
```

becomes:

```ts
const { desktopKeys } = makeSetup();  // or pull desktopKeys from setup
lastSocket!.simulateStringMessage(encAead(desktopKeys.sendKey, device.sid, 0, msg));
```

Goal: zero references to `SendStream` / `RecvStream` anywhere in this test file after this step.

- [ ] **Step 7: Run the mobile jest suite**

Run: `cd mobile && npx jest`

Expected: all mobile tests pass, including both new stateless-AEAD tests and every existing test updated to the new helper.

- [ ] **Step 8: Commit**

```bash
git add mobile/src/transport/relay-ws.transport.ts mobile/src/__tests__/relay-ws.transport.test.ts
git commit -m "refactor(mobile-relay): migrate phone relay transport to stateless AEAD"
```

---

## Task 5: Rewrite the relay-reconnect integration test for the new behavior

**Files:**
- Modify: `electron/mobile-bridge/__tests__/relay-reconnect.integration.test.ts`

- [ ] **Step 1: Replace the file with the stateless-AEAD regression test**

Replace `electron/mobile-bridge/__tests__/relay-reconnect.integration.test.ts` contents:

```ts
import { describe, it, expect } from 'vitest';
import { x25519, ed25519 } from '@noble/curves/ed25519';
import { RelayConnection } from '../relay-connection';
import { deriveSessionKeys } from '../../../shared/crypto/noise';
import { aeadEncrypt } from '../../../shared/crypto/aead';
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

function encEnvelope(
  sendKey: Uint8Array,
  sid: string,
  seq: number,
  msg: MobileMessageV2,
): string {
  const plain = new TextEncoder().encode(encodeV2(msg));
  const { nonce, ct } = aeadEncrypt(sendKey, plain);
  return JSON.stringify({
    v: 2, sid, seq, kind: 'data',
    nonce: b64(nonce), ct: b64(ct),
  });
}

describe('RelayConnection — production bug regression (stateless AEAD)', () => {
  it('handles asymmetric reconnect — desktop resets but phone keeps sending without decrypt failures', () => {
    const keys = makeKeys();
    const device = makeDevice(keys);

    const conn = new RelayConnection({
      desktop: { priv: keys.desktopPriv, pub: keys.desktopPub },
      device,
    });

    const received: MobileMessageV2[] = [];
    conn.on('message', (m: MobileMessageV2) => received.push(m));

    const sessionKeys = deriveSessionKeys(keys.phonePriv, keys.desktopPub, 'initiator');
    const client: any = (conn as any).client;

    // Simulate initial connect — desktop's WS came up for the first time.
    client.emit('connect');

    // Steady-state phone→desktop traffic at seq 0..4.
    for (let seq = 0; seq <= 4; seq++) {
      client.emit('message', encEnvelope(
        sessionKeys.sendKey, device.sid!, seq, { type: 'heartbeat', v: 2 },
      ));
    }
    expect(received).toHaveLength(5);
    expect((conn as any).lastRecvSeq).toBe(4);

    // Simulate the production-bug scenario: desktop's WS flaps and reconnects.
    // RelayClient re-emits 'connect'; RelayConnection resets its seq counters
    // (but there's no crypto state to reset anymore — nonces are stateless).
    client.emit('connect');
    expect((conn as any).lastRecvSeq).toBe(-1);

    // Phone never noticed the desktop flap, so it keeps sending under the
    // same session key but with fresh random nonces per envelope. We pick
    // up its seq counter past the (former) 8-wide sliding window boundary
    // to demonstrate the bug is fixed — previously frames 9+ would fail.
    for (let seq = 5; seq <= 24; seq++) {
      client.emit('message', encEnvelope(
        sessionKeys.sendKey, device.sid!, seq, { type: 'heartbeat', v: 2 },
      ));
    }

    // Every single frame decoded: 5 from the first round + 20 from after
    // the desktop reset.
    expect(received).toHaveLength(5 + 20);
    expect((conn as any).lastRecvSeq).toBe(24);

    conn.stop();
  });

  it('handles phone reconnect — phone resets its seq back to 0, desktop still decrypts everything', () => {
    const keys = makeKeys();
    const device = makeDevice(keys);

    const conn = new RelayConnection({
      desktop: { priv: keys.desktopPriv, pub: keys.desktopPub },
      device,
    });

    const received: MobileMessageV2[] = [];
    conn.on('message', (m: MobileMessageV2) => received.push(m));

    const sessionKeys = deriveSessionKeys(keys.phonePriv, keys.desktopPub, 'initiator');
    const client: any = (conn as any).client;
    client.emit('connect');

    // Phone sends a few envelopes.
    client.emit('message', encEnvelope(sessionKeys.sendKey, device.sid!, 0, { type: 'heartbeat', v: 2 }));
    client.emit('message', encEnvelope(sessionKeys.sendKey, device.sid!, 1, { type: 'heartbeat', v: 2 }));
    expect(received).toHaveLength(2);
    expect((conn as any).lastRecvSeq).toBe(1);

    // Phone reconnects — its seq counter goes back to 0. Under the old
    // stream-cipher design this would collide with replay dedup. With
    // stateless AEAD + the desktop's own 'connect' event resetting
    // lastRecvSeq, the replay of seq=0 is accepted cleanly.
    client.emit('connect');
    client.emit('message', encEnvelope(sessionKeys.sendKey, device.sid!, 0, { type: 'heartbeat', v: 2 }));
    client.emit('message', encEnvelope(sessionKeys.sendKey, device.sid!, 1, { type: 'heartbeat', v: 2 }));

    expect(received).toHaveLength(4);
    expect((conn as any).lastRecvSeq).toBe(1);

    conn.stop();
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `npx vitest run electron/mobile-bridge/__tests__/relay-reconnect.integration.test.ts`

Expected: PASS — both tests green.

- [ ] **Step 3: Run the full vitest suite**

Run: `npx vitest run`

Expected: all 790+ tests passing. Take note of any failures — they should be zero at this point. If anything in `ws-server.integration.test.ts`, `phase-history.test.ts`, `pairing-fsm.test.ts`, or `pairing` tests fails, that's a surprise — those tests should not touch the relay path, but if they do they need to be updated to the new envelope shape.

- [ ] **Step 4: Commit**

```bash
git add electron/mobile-bridge/__tests__/relay-reconnect.integration.test.ts
git commit -m "test(relay-reconnect): rewrite integration for stateless AEAD"
```

---

## Task 6: Documentation — worker comment refresh + supersede notes

**Files:**
- Modify: `relay/src/session-do.ts`
- Modify: `docs/superpowers/specs/2026-04-21-relay-ratchet-reset-design.md`
- Modify: `docs/superpowers/specs/2026-04-21-mobile-fixes-batch-design.md`

- [ ] **Step 1: Refresh the worker comment**

In `relay/src/session-do.ts`, locate the block at lines 98-101 that currently reads:

```ts
    // Also kick the peer of the OTHER role so their encryption streams reset
    // in lockstep — unless we ourselves just kicked this role, in which case
    // this connect IS the response to that kick and the counterparty is
    // already fresh. Without this cooldown the two peers ping-pong forever.
```

Replace with:

```ts
    // Also kick the peer of the OTHER role so it observes a fresh WS and
    // reinitializes its per-connection seq counter. With stateless AEAD the
    // peer's crypto state needs no resync, but the seq baseline still does
    // ("last one wins" semantics per role). Unless we ourselves just kicked
    // this role — in which case this connect IS the response to that kick and
    // the counterparty is already fresh. Without this cooldown the two peers
    // ping-pong forever.
```

- [ ] **Step 2: Add supersede notes to the old specs**

At the top of `docs/superpowers/specs/2026-04-21-relay-ratchet-reset-design.md`, immediately after the `# Relay Ratchet Reset — Design` heading, insert:

```markdown
> **Superseded by `2026-04-21-relay-stateless-nonces-design.md` (2026-04-21).** The `seq=0` peer-reconnect signal and the `SendStream`/`RecvStream` counter-sync protocol described here have been replaced with a stateless AEAD pattern (random nonce per envelope). This document is kept for historical context.
```

At the top of `docs/superpowers/specs/2026-04-21-mobile-fixes-batch-design.md`, immediately after the `# Mobile Fixes Batch — Design` heading, insert:

```markdown
> **Partial supersede (crypto portions only) by `2026-04-21-relay-stateless-nonces-design.md` (2026-04-21).** Fix 1 in this doc (the `resetStreams` / `resetCryptoStreams` split on desktop and `resetAllOnConnect` / `resetCryptoOnly` on phone) has been retired along with the entire counter-based crypto ratchet. Fix 2 (`USER_RESPONSE` Q&A mobile echo) is unrelated and remains in effect.
```

- [ ] **Step 3: Run the full suite**

Run these in parallel:
- Desktop: `npx vitest run`
- Mobile: `cd mobile && npx jest`

Expected: both green. Desktop vitest ≥ 790 tests, mobile jest ≥ 52 tests. New tests from Tasks 1, 2, 3, 4, 5 should push both counts up.

- [ ] **Step 4: Commit**

```bash
git add -f docs/superpowers/specs/2026-04-21-relay-ratchet-reset-design.md \
       docs/superpowers/specs/2026-04-21-mobile-fixes-batch-design.md
git add relay/src/session-do.ts
git commit -m "docs(relay): refresh worker comment and supersede old ratchet specs"
```

---

## Post-task verification

After all six tasks commit cleanly, run one final end-to-end check:

- [ ] **Full test sweep:**
  ```
  npx vitest run && (cd mobile && npx jest)
  ```
  Both green, no regressions.

- [ ] **Grep check:** no production (non-test) references to `SendStream` / `RecvStream` remain on the relay path:
  ```
  grep -rn "SendStream\|RecvStream" electron/mobile-bridge/relay-connection.ts \
                                    mobile/src/transport/relay-ws.transport.ts
  ```
  Expected: zero matches.

- [ ] **Manual QA (deferred to user):** run the app, pair a phone, verify chat round-trips work end-to-end. Drop and restore network on one side to confirm recovery happens cleanly without decrypt-failure log spam. This requires a deployed worker with the new envelope schema — coordinate worker deploy separately.
