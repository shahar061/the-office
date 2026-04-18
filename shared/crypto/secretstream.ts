// shared/crypto/secretstream.ts — Framed AEAD transport over a session key.
// Single-direction stream with monotonic nonces; rekey rotates the key via hkdf.

import { chacha20poly1305 } from '@noble/ciphers/chacha';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';

const NONCE_LEN = 12; // chacha20poly1305 uses 12-byte nonce
export const REKEY_TAG = 0x01;
const DATA_TAG = 0x00;

function makeNonce(counter: bigint): Uint8Array {
  const n = new Uint8Array(NONCE_LEN);
  const view = new DataView(n.buffer);
  view.setBigUint64(4, counter, false);
  return n;
}

function deriveNextKey(key: Uint8Array): Uint8Array {
  return hkdf(sha256, key, new Uint8Array(0), 'office-secretstream-rekey', 32);
}

export class SendStream {
  private counter = 0n;
  constructor(private key: Uint8Array) {}

  encrypt(plaintext: Uint8Array): Uint8Array {
    const cipher = chacha20poly1305(this.key, makeNonce(this.counter));
    const tagged = new Uint8Array(plaintext.length + 1);
    tagged[0] = DATA_TAG;
    tagged.set(plaintext, 1);
    const ct = cipher.encrypt(tagged);
    this.counter += 1n;
    return ct;
  }

  rekey(): void {
    this.key = deriveNextKey(this.key);
    this.counter = 0n;
  }
}

const RECV_WINDOW = 8n; // how many nonces ahead we'll scan

export class RecvStream {
  private counter = 0n;
  constructor(private key: Uint8Array) {}

  decrypt(ciphertext: Uint8Array): Uint8Array {
    // Try nonces from current counter up to counter+RECV_WINDOW.
    // On success, advance counter past the matched nonce so earlier
    // nonces (out-of-order or replayed frames) are permanently rejected.
    const limit = this.counter + RECV_WINDOW;
    for (let n = this.counter; n <= limit; n++) {
      try {
        const cipher = chacha20poly1305(this.key, makeNonce(n));
        const tagged = cipher.decrypt(ciphertext);
        this.counter = n + 1n; // advance past the matched slot
        if (tagged[0] === REKEY_TAG) return new Uint8Array(0);
        return tagged.slice(1);
      } catch {
        // wrong nonce — try the next one
      }
    }
    throw new Error('decryption failed: no matching nonce in window');
  }

  rekey(): void {
    this.key = deriveNextKey(this.key);
    this.counter = 0n;
  }
}
