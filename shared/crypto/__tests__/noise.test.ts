import { describe, it, expect } from 'vitest';
import { x25519 } from '@noble/curves/ed25519';
import { deriveSessionKeys } from '../noise';

describe('deriveSessionKeys', () => {
  it('derives matching send/recv key pairs on both sides', () => {
    const aPriv = x25519.utils.randomPrivateKey();
    const aPub = x25519.getPublicKey(aPriv);
    const bPriv = x25519.utils.randomPrivateKey();
    const bPub = x25519.getPublicKey(bPriv);

    const aKeys = deriveSessionKeys(aPriv, bPub, 'initiator');
    const bKeys = deriveSessionKeys(bPriv, aPub, 'responder');

    expect(Buffer.from(aKeys.sendKey).toString('hex'))
      .toBe(Buffer.from(bKeys.recvKey).toString('hex'));
    expect(Buffer.from(aKeys.recvKey).toString('hex'))
      .toBe(Buffer.from(bKeys.sendKey).toString('hex'));
  });

  it('is deterministic for the same inputs', () => {
    const priv = x25519.utils.randomPrivateKey();
    const pub = x25519.getPublicKey(x25519.utils.randomPrivateKey());
    const k1 = deriveSessionKeys(priv, pub, 'initiator');
    const k2 = deriveSessionKeys(priv, pub, 'initiator');
    expect(Buffer.from(k1.sendKey).toString('hex'))
      .toBe(Buffer.from(k2.sendKey).toString('hex'));
  });

  it('produces different keys for different pubkeys', () => {
    const priv = x25519.utils.randomPrivateKey();
    const pubA = x25519.getPublicKey(x25519.utils.randomPrivateKey());
    const pubB = x25519.getPublicKey(x25519.utils.randomPrivateKey());
    const kA = deriveSessionKeys(priv, pubA, 'initiator');
    const kB = deriveSessionKeys(priv, pubB, 'initiator');
    expect(Buffer.from(kA.sendKey).toString('hex'))
      .not.toBe(Buffer.from(kB.sendKey).toString('hex'));
  });
});
