import { describe, it, expect } from 'vitest';
import { deriveSas } from '../sas';

describe('deriveSas', () => {
  const desktopPub = new Uint8Array(32).fill(1);
  const devicePub  = new Uint8Array(32).fill(2);
  const pairingToken = 'abc123';

  it('returns 6 decimal digits as "XXX XXX"', () => {
    const sas = deriveSas(desktopPub, devicePub, pairingToken);
    expect(sas).toMatch(/^\d{3} \d{3}$/);
  });

  it('is deterministic for identical inputs', () => {
    const a = deriveSas(desktopPub, devicePub, pairingToken);
    const b = deriveSas(desktopPub, devicePub, pairingToken);
    expect(a).toBe(b);
  });

  it('changes if any input changes', () => {
    const a = deriveSas(desktopPub, devicePub, pairingToken);
    const b = deriveSas(desktopPub, devicePub, pairingToken + 'x');
    expect(a).not.toBe(b);
  });

  it('is symmetric when args stay in same order', () => {
    // This must match across devices — both sides compute with same arg order.
    const sas = deriveSas(desktopPub, devicePub, pairingToken);
    expect(sas).toBe(deriveSas(desktopPub, devicePub, pairingToken));
  });
});
