import { describe, it, expect } from 'vitest';
import { createMobileBridge } from '../index';

function fakeSettings() {
  let state: any = { mobile: { enabled: true, port: 0, devices: [] } };
  return {
    get: () => state,
    update: (patch: any) => { state = { ...state, ...patch }; return state; },
  };
}

describe('MobileBridge.onSessionScopeChanged', () => {
  it('flips sessionActive in subsequent snapshots', async () => {
    const bridge = createMobileBridge({ settings: fakeSettings(), desktopName: 'Test' });
    await bridge.start();
    try {
      bridge.onSessionScopeChanged({
        active: true, sessionId: '/tmp/foo', projectName: 'foo', projectRoot: '/tmp/foo',
      });
      expect(bridge.__getSnapshotForTests().sessionActive).toBe(true);
      expect(bridge.__getSnapshotForTests().sessionId).toBe('/tmp/foo');
      expect(bridge.__getSnapshotForTests().projectName).toBe('foo');

      bridge.onSessionScopeChanged({ active: false });
      expect(bridge.__getSnapshotForTests().sessionActive).toBe(false);
      expect(bridge.__getSnapshotForTests().sessionId).toBeNull();
    } finally {
      await bridge.stop();
    }
  });
});

describe('MobileBridge.getPairingQR gating', () => {
  it('rejects when scope is inactive (default)', async () => {
    const bridge = createMobileBridge({ settings: fakeSettings(), desktopName: 'Test' });
    await bridge.start();
    try {
      await expect(bridge.getPairingQR()).rejects.toThrow(/project|session/i);
    } finally {
      await bridge.stop();
    }
  });

  it('resolves a QR when scope is active', async () => {
    const bridge = createMobileBridge({ settings: fakeSettings(), desktopName: 'Test' });
    await bridge.start();
    try {
      bridge.onSessionScopeChanged({
        active: true, sessionId: '/tmp/p', projectName: 'p', projectRoot: '/tmp/p',
      });
      const qr = await bridge.getPairingQR();
      expect(qr.qrPayload).toBeTruthy();
      expect(qr.expiresAt).toBeGreaterThan(Date.now());
    } finally {
      await bridge.stop();
    }
  });
});
