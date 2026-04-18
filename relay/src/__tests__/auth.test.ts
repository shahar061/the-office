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

/** base64url mirror of the desktop's `signPairToken` — see
 *  `electron/mobile-bridge/pairing.ts`. The real function uses Node's
 *  Buffer.toString('base64url'); here we strip and replace manually so the
 *  test can run in the Worker-test environment. If these two encodings ever
 *  drift, the "accepts base64url" tests below start failing. */
function signTokenBase64Url(priv: Uint8Array, claims: any): string {
  const toUrl = (s: string) => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const body = toUrl(btoa(JSON.stringify(claims)));
  const sig = ed25519.sign(new TextEncoder().encode(body), priv);
  const sigB64 = toUrl(btoa(String.fromCharCode(...sig)));
  return `${body}.${sigB64}`;
}

describe('verifyToken — cross-boundary base64url format', () => {
  // The desktop's signPairToken emits base64url (URL/header-safe). The relay
  // MUST accept base64url — previous versions used atob() directly which only
  // handles standard base64 and chokes on `-` / `_` / missing padding, causing
  // ~99% of production tokens to fail verification.

  it('accepts a base64url-encoded token', () => {
    const priv = ed25519.utils.randomPrivateKey();
    const pub = ed25519.getPublicKey(priv);
    const token = signTokenBase64Url(priv, { sid: 'S', role: 'phone', epoch: 1, exp: Date.now() + 60_000 });
    expect(verifyToken(pub, token, { sid: 'S', role: 'phone', currentEpoch: 1 })).not.toBeNull();
  });

  it('accepts 50 random base64url-encoded tokens (signatures with - and _ characters)', () => {
    // ~98% of ed25519 signatures contain `-` or `_` in base64url — rejecting
    // any of them would be a production outage. Batch to shake out intermittent bugs.
    for (let i = 0; i < 50; i++) {
      const priv = ed25519.utils.randomPrivateKey();
      const pub = ed25519.getPublicKey(priv);
      const token = signTokenBase64Url(priv, { sid: 'S', role: 'phone', epoch: 1, exp: Date.now() + 60_000 });
      const result = verifyToken(pub, token, { sid: 'S', role: 'phone', currentEpoch: 1 });
      expect(result).not.toBeNull();
    }
  });

  it('rejects a base64url-encoded token with a tampered signature', () => {
    const priv = ed25519.utils.randomPrivateKey();
    const pub = ed25519.getPublicKey(priv);
    const token = signTokenBase64Url(priv, { sid: 'S', role: 'phone', epoch: 1, exp: Date.now() + 60_000 });
    const tampered = token.slice(0, -4) + 'AAAA';
    expect(verifyToken(pub, tampered, { sid: 'S', role: 'phone', currentEpoch: 1 })).toBeNull();
  });
});
