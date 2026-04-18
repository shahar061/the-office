import { describe, it, expect } from 'vitest';
import { SendStream, RecvStream, REKEY_TAG } from '../secretstream';

describe('secretstream', () => {
  it('encrypts and decrypts a round-trip message', () => {
    const key = new Uint8Array(32).fill(7);
    const send = new SendStream(key);
    const recv = new RecvStream(key);

    const ct = send.encrypt(new TextEncoder().encode('hello'));
    const pt = recv.decrypt(ct);
    expect(new TextDecoder().decode(pt)).toBe('hello');
  });

  it('rejects tampered ciphertext', () => {
    const key = new Uint8Array(32).fill(7);
    const send = new SendStream(key);
    const recv = new RecvStream(key);
    const ct = send.encrypt(new TextEncoder().encode('secret'));
    ct[5] ^= 0xff;
    expect(() => recv.decrypt(ct)).toThrow();
  });

  it('supports rekey', () => {
    const key = new Uint8Array(32).fill(7);
    const send = new SendStream(key);
    const recv = new RecvStream(key);

    const ct1 = send.encrypt(new TextEncoder().encode('one'));
    recv.decrypt(ct1);

    send.rekey();
    recv.rekey();

    const ct2 = send.encrypt(new TextEncoder().encode('two'));
    expect(new TextDecoder().decode(recv.decrypt(ct2))).toBe('two');
  });

  it('rejects frames delivered out of order', () => {
    const key = new Uint8Array(32).fill(7);
    const send = new SendStream(key);
    const recv = new RecvStream(key);
    const a = send.encrypt(new TextEncoder().encode('a'));
    const b = send.encrypt(new TextEncoder().encode('b'));
    recv.decrypt(b); // skipping a increments nonce past a
    expect(() => recv.decrypt(a)).toThrow();
  });
});

export { REKEY_TAG };
