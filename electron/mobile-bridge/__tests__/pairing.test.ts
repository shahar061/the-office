import { describe, it, expect } from 'vitest';
import {
  createPairingToken,
  isPairingTokenExpired,
  generateDeviceToken,
  hashDeviceToken,
  verifyDeviceToken,
  generatePairSignKeypair,
  signPairToken,
  verifyPairToken,
} from '../pairing';

describe('pairing module', () => {
  describe('createPairingToken', () => {
    it('produces a url-safe base64 token of at least 32 bytes of entropy', () => {
      const { token, expiresAt } = createPairingToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      // 32 bytes base64url → 43 chars without padding
      expect(token.length).toBeGreaterThanOrEqual(43);
      expect(expiresAt).toBeGreaterThan(Date.now());
      expect(expiresAt).toBeLessThanOrEqual(Date.now() + 5 * 60 * 1000 + 100);
    });

    it('produces unique tokens on each call', () => {
      const a = createPairingToken();
      const b = createPairingToken();
      expect(a.token).not.toBe(b.token);
    });
  });

  describe('isPairingTokenExpired', () => {
    it('returns true for expired timestamps', () => {
      expect(isPairingTokenExpired(Date.now() - 1)).toBe(true);
    });
    it('returns false for future timestamps', () => {
      expect(isPairingTokenExpired(Date.now() + 60_000)).toBe(false);
    });
  });

  describe('generateDeviceToken', () => {
    it('produces a 32-byte base64url token', () => {
      const t = generateDeviceToken();
      expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(t.length).toBeGreaterThanOrEqual(43);
    });
  });

  describe('hashDeviceToken / verifyDeviceToken', () => {
    it('verifies a token against its own hash', async () => {
      const token = generateDeviceToken();
      const hash = await hashDeviceToken(token);
      expect(await verifyDeviceToken(token, hash)).toBe(true);
    });

    it('rejects a token that does not match its hash', async () => {
      const a = generateDeviceToken();
      const b = generateDeviceToken();
      const hashA = await hashDeviceToken(a);
      expect(await verifyDeviceToken(b, hashA)).toBe(false);
    });

    it('produces different hashes for the same token (random salt)', async () => {
      const token = generateDeviceToken();
      const h1 = await hashDeviceToken(token);
      const h2 = await hashDeviceToken(token);
      expect(h1).not.toBe(h2);
      expect(await verifyDeviceToken(token, h1)).toBe(true);
      expect(await verifyDeviceToken(token, h2)).toBe(true);
    });
  });
});

describe('v2 pairing helpers', () => {
  it('generatePairSignKeypair returns Ed25519 keys', () => {
    const kp = generatePairSignKeypair();
    expect(kp.priv).toHaveLength(32);
    expect(kp.pub).toHaveLength(32);
  });

  it('signPairToken + verifyPairToken round-trip', () => {
    const kp = generatePairSignKeypair();
    const token = signPairToken(kp.priv, { sid: 'S', role: 'phone', epoch: 1, exp: 9999 });
    const claims = verifyPairToken(kp.pub, token);
    expect(claims?.sid).toBe('S');
    expect(claims?.role).toBe('phone');
  });

  it('verifyPairToken rejects tampered token', () => {
    const kp = generatePairSignKeypair();
    const token = signPairToken(kp.priv, { sid: 'S', role: 'phone', epoch: 1, exp: 9999 });
    const tampered = token.slice(0, -4) + 'AAAA';
    expect(verifyPairToken(kp.pub, tampered)).toBeNull();
  });
});
