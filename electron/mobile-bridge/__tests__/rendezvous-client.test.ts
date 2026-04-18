import { describe, it, expect } from 'vitest';
import { RendezvousClient } from '../rendezvous-client';
import { getOrCreateIdentity } from '../identity';
import { createPairingToken } from '../pairing';
import { DeviceStore } from '../device-store';
import type { AppSettings } from '../../../shared/types';

function makeStore() {
  let state: AppSettings = {
    defaultModelPreset: 'default', defaultPermissionMode: 'auto-safe',
    maxParallelTLs: 4, gitIdentities: [], defaultGitIdentityId: null,
    gitPreferences: { includeOfficeStateInRepo: false },
    mobile: { enabled: true, port: null, devices: [] },
  };
  return { get: () => state, update: (p: Partial<AppSettings>) => { state = { ...state, ...p }; return state; } };
}

function makeOpts() {
  const store = makeStore() as any;
  return {
    identity: getOrCreateIdentity(store),
    desktopName: 'test',
    deviceStore: new DeviceStore(store),
    pairingToken: createPairingToken(),
    roomId: 'test-room',
    relayUrl: 'wss://relay.test',
    onPaired: () => {},
    onPendingSas: () => {},
  };
}

describe('RendezvousClient', () => {
  it('construction does not throw', () => {
    expect(() => new RendezvousClient(makeOpts())).not.toThrow();
  });

  it('isConnected() is false before start()', () => {
    const c = new RendezvousClient(makeOpts());
    expect(c.isConnected()).toBe(false);
  });

  it('stop() is safe when never started', () => {
    const c = new RendezvousClient(makeOpts());
    expect(() => c.stop()).not.toThrow();
  });
});
