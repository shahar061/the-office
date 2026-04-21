import { describe, it, expect } from 'vitest';
import { randomBytes } from '@noble/hashes/utils';
import { aeadEncrypt, aeadDecrypt } from '../aead';

function randomKey(): Uint8Array {
  return randomBytes(32);
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
