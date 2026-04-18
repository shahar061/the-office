// shared/types/envelope.ts — Outer routing envelope the relay sees.
// The relay reads sid/seq/kind and forwards ct without decrypting.

export interface RelayEnvelope {
  v: 2;
  sid: string;
  seq: number;
  kind: 'data' | 'ctrl';
  ct: string;     // base64-encoded ciphertext
}
