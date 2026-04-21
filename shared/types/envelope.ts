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
