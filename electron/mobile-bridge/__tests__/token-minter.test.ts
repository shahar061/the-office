import { describe, it, expect } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519';
import { mintToken } from '../token-minter';
import { verifyPairToken } from '../pairing';

describe('mintToken', () => {
  it('produces a verifiable short-lived token', () => {
    const priv = ed25519.utils.randomPrivateKey();
    const pub = ed25519.getPublicKey(priv);
    const token = mintToken(priv, { sid: 'SID', role: 'desktop', epoch: 1, ttlMs: 900_000 });
    const claims = verifyPairToken(pub, token);
    expect(claims?.sid).toBe('SID');
    expect(claims?.role).toBe('desktop');
    expect(claims!.epoch).toBe(1);
    expect(claims!.exp - Date.now()).toBeGreaterThan(800_000);
    expect(claims!.exp - Date.now()).toBeLessThanOrEqual(900_000);
  });

  it('rejects verification after tampering', () => {
    const priv = ed25519.utils.randomPrivateKey();
    const wrongPub = ed25519.getPublicKey(ed25519.utils.randomPrivateKey());
    const token = mintToken(priv, { sid: 'SID', role: 'phone', epoch: 1, ttlMs: 900_000 });
    expect(verifyPairToken(wrongPub, token)).toBeNull();
  });
});
