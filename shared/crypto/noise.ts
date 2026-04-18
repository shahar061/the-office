// shared/crypto/noise.ts — Session key derivation for the mobile bridge.
// Both sides compute an X25519 shared secret, then HKDF-expand it into two
// 32-byte keys. Role controls which half is "send" vs "recv" so initiator
// and responder never reuse the same key for both directions.

import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';

export interface NoiseSessionKeys {
  sendKey: Uint8Array;
  recvKey: Uint8Array;
}

export function deriveSessionKeys(
  localPriv: Uint8Array,
  remotePub: Uint8Array,
  role: 'initiator' | 'responder',
): NoiseSessionKeys {
  const shared = x25519.getSharedSecret(localPriv, remotePub);
  const okm = hkdf(sha256, shared, new Uint8Array(0), 'office-session-v2', 64);
  const a = okm.slice(0, 32);
  const b = okm.slice(32, 64);
  // initiator sends with `a`, responder sends with `b`. Mirror on recv.
  return role === 'initiator'
    ? { sendKey: a, recvKey: b }
    : { sendKey: b, recvKey: a };
}
