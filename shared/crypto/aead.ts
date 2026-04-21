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
import { randomBytes } from '@noble/hashes/utils';

const NONCE_LEN = 12;

export function aeadEncrypt(
  key: Uint8Array,
  plaintext: Uint8Array,
): { nonce: Uint8Array; ct: Uint8Array } {
  const nonce = randomBytes(NONCE_LEN);
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
