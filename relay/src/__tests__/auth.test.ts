import { describe, it, expect } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519';
import { verifyToken } from '../auth';

function signToken(priv: Uint8Array, claims: any): string {
  const body = btoa(JSON.stringify(claims));
  const sig = ed25519.sign(new TextEncoder().encode(body), priv);
  return `${body}.${btoa(String.fromCharCode(...sig))}`;
}

describe('verifyToken', () => {
  it('accepts a valid token', () => {
    const priv = ed25519.utils.randomPrivateKey();
    const pub = ed25519.getPublicKey(priv);
    const token = signToken(priv, { sid: 'S', role: 'phone', epoch: 1, exp: Date.now() + 60_000 });
    const decoded = verifyToken(pub, token, { sid: 'S', role: 'phone', currentEpoch: 1 });
    expect(decoded?.role).toBe('phone');
  });

  it('rejects mismatched sid', () => {
    const priv = ed25519.utils.randomPrivateKey();
    const pub = ed25519.getPublicKey(priv);
    const token = signToken(priv, { sid: 'X', role: 'phone', epoch: 1, exp: Date.now() + 60_000 });
    expect(verifyToken(pub, token, { sid: 'S', role: 'phone', currentEpoch: 1 })).toBeNull();
  });

  it('rejects mismatched role when role is specified', () => {
    const priv = ed25519.utils.randomPrivateKey();
    const pub = ed25519.getPublicKey(priv);
    const token = signToken(priv, { sid: 'S', role: 'desktop', epoch: 1, exp: Date.now() + 60_000 });
    expect(verifyToken(pub, token, { sid: 'S', role: 'phone', currentEpoch: 1 })).toBeNull();
  });

  it('rejects mismatched epoch', () => {
    const priv = ed25519.utils.randomPrivateKey();
    const pub = ed25519.getPublicKey(priv);
    const token = signToken(priv, { sid: 'S', role: 'phone', epoch: 1, exp: Date.now() + 60_000 });
    expect(verifyToken(pub, token, { sid: 'S', role: 'phone', currentEpoch: 2 })).toBeNull();
  });

  it('rejects expired with 60s skew tolerance', () => {
    const priv = ed25519.utils.randomPrivateKey();
    const pub = ed25519.getPublicKey(priv);
    // Expired 2 minutes ago — beyond skew
    const token = signToken(priv, { sid: 'S', role: 'phone', epoch: 1, exp: Date.now() - 120_000 });
    expect(verifyToken(pub, token, { sid: 'S', role: 'phone', currentEpoch: 1 })).toBeNull();
  });

  it('rejects tampered signature', () => {
    const priv = ed25519.utils.randomPrivateKey();
    const pub = ed25519.getPublicKey(priv);
    const token = signToken(priv, { sid: 'S', role: 'phone', epoch: 1, exp: Date.now() + 60_000 });
    const tampered = token.slice(0, -4) + 'AAAA';
    expect(verifyToken(pub, tampered, { sid: 'S', role: 'phone', currentEpoch: 1 })).toBeNull();
  });

  it('accepts token when role check is omitted', () => {
    const priv = ed25519.utils.randomPrivateKey();
    const pub = ed25519.getPublicKey(priv);
    const token = signToken(priv, { sid: 'S', role: 'desktop', epoch: 1, exp: Date.now() + 60_000 });
    const decoded = verifyToken(pub, token, { sid: 'S', currentEpoch: 1 });
    expect(decoded?.role).toBe('desktop');
  });
});
