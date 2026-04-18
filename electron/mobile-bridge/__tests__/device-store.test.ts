import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeviceStore } from '../device-store';
import type { AppSettings, PairedDevice } from '../../../shared/types';

function makeFakeSettings(): AppSettings {
  return {
    defaultModelPreset: 'default',
    defaultPermissionMode: 'auto-safe',
    maxParallelTLs: 4,
    gitIdentities: [],
    defaultGitIdentityId: null,
    gitPreferences: { includeOfficeStateInRepo: false },
    mobile: { enabled: true, port: null, devices: [] },
  };
}

function makeFakeStore() {
  let state = makeFakeSettings();
  return {
    get: vi.fn(() => ({ ...state, mobile: state.mobile ? { ...state.mobile, devices: [...state.mobile.devices] } : undefined })),
    update: vi.fn((patch: Partial<AppSettings>) => {
      state = { ...state, ...patch };
      return state;
    }),
  };
}

describe('DeviceStore', () => {
  let fake: ReturnType<typeof makeFakeStore>;
  let store: DeviceStore;

  beforeEach(() => {
    fake = makeFakeStore();
    store = new DeviceStore(fake as any);
  });

  it('list returns empty on fresh settings', () => {
    expect(store.list()).toEqual([]);
  });

  it('add persists a new device and returns it', () => {
    const device: PairedDevice = {
      deviceId: 'd1',
      deviceName: 'iPhone',
      deviceTokenHash: 'salt$key',
      pairedAt: 100,
      lastSeenAt: 100,
    };
    store.add(device);
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]).toMatchObject(device);
    expect(fake.update).toHaveBeenCalled();
  });

  it('add replaces an existing device with the same id', () => {
    const device: PairedDevice = { deviceId: 'd1', deviceName: 'old', deviceTokenHash: 'h1', pairedAt: 1, lastSeenAt: 1 };
    const updated: PairedDevice = { deviceId: 'd1', deviceName: 'new', deviceTokenHash: 'h2', pairedAt: 1, lastSeenAt: 5 };
    store.add(device);
    store.add(updated);
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0].deviceName).toBe('new');
  });

  it('findById returns the matching device or undefined', () => {
    const device: PairedDevice = { deviceId: 'd1', deviceName: 'iPhone', deviceTokenHash: 'h', pairedAt: 1, lastSeenAt: 1 };
    store.add(device);
    expect(store.findById('d1')).toMatchObject(device);
    expect(store.findById('nope')).toBeUndefined();
  });

  it('remove deletes a device by id', () => {
    store.add({ deviceId: 'd1', deviceName: 'a', deviceTokenHash: 'h', pairedAt: 1, lastSeenAt: 1 });
    store.add({ deviceId: 'd2', deviceName: 'b', deviceTokenHash: 'h', pairedAt: 1, lastSeenAt: 1 });
    store.remove('d1');
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0].deviceId).toBe('d2');
  });

  it('touch updates lastSeenAt without other changes', () => {
    store.add({ deviceId: 'd1', deviceName: 'a', deviceTokenHash: 'h', pairedAt: 100, lastSeenAt: 100 });
    store.touch('d1', 500);
    expect(store.findById('d1')?.lastSeenAt).toBe(500);
    expect(store.findById('d1')?.pairedAt).toBe(100);
  });
});

describe('DeviceStore v2 fields', () => {
  it('round-trips v2 fields via add() and list()', () => {
    const fake = makeFakeStore();
    const store = new DeviceStore(fake as any);
    store.add({
      deviceId: 'd1',
      deviceName: 'iPhone',
      deviceTokenHash: 'hash',
      pairedAt: 1,
      lastSeenAt: 1,
      phoneIdentityPub: 'PIP',
      pairSignPriv: 'PSP',
      pairSignPub: 'PSU',
      sid: 'SID',
      remoteAllowed: true,
      epoch: 1,
    });
    const [d] = store.list();
    expect(d.phoneIdentityPub).toBe('PIP');
    expect(d.pairSignPub).toBe('PSU');
    expect(d.sid).toBe('SID');
    expect(d.remoteAllowed).toBe(true);
    expect(d.epoch).toBe(1);
  });

  it('fills defaults when reading a v1 record (no v2 fields stored)', () => {
    const fake = makeFakeStore();
    const store = new DeviceStore(fake as any);
    // Simulate a v1 record written before this plan landed:
    store.add({
      deviceId: 'legacy', deviceName: 'old', deviceTokenHash: 'h',
      pairedAt: 1, lastSeenAt: 1,
    });
    const [d] = store.list();
    expect(d.remoteAllowed).toBe(false);
    expect(d.epoch).toBe(0);
    expect(d.sid).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(d.phoneIdentityPub).toBe('');
    expect(d.pairSignPriv).toBe('');
    expect(d.pairSignPub).toBe('');
  });

  it('keeps an assigned sid stable across reads (does not re-roll)', () => {
    const fake = makeFakeStore();
    const store = new DeviceStore(fake as any);
    store.add({ deviceId: 'd1', deviceName: 'n', deviceTokenHash: 'h', pairedAt: 1, lastSeenAt: 1, sid: 'FIXED' });
    expect(store.list()[0].sid).toBe('FIXED');
    expect(store.list()[0].sid).toBe('FIXED');
  });
});

describe('DeviceStore rename + setRemoteAccess', () => {
  const baseFixture = {
    deviceId: 'd1',
    deviceName: 'old-name',
    deviceTokenHash: 'h',
    pairedAt: 1,
    lastSeenAt: 1,
    phoneIdentityPub: 'PIP',
    pairSignPriv: 'PSP',
    pairSignPub: 'PSU',
    sid: 'SID',
    remoteAllowed: false,
    epoch: 1,
  };

  it('rename updates the deviceName for an existing device', () => {
    const fake = makeFakeStore();
    const store = new DeviceStore(fake as any);
    store.add(baseFixture);
    store.rename('d1', 'new-name');
    const [d] = store.list();
    expect(d.deviceName).toBe('new-name');
  });

  it('rename is a no-op for unknown deviceId', () => {
    const fake = makeFakeStore();
    const store = new DeviceStore(fake as any);
    store.add(baseFixture);
    store.rename('unknown', 'whatever');
    const [d] = store.list();
    expect(d.deviceName).toBe('old-name');
  });

  it('setRemoteAccess flips the flag', () => {
    const fake = makeFakeStore();
    const store = new DeviceStore(fake as any);
    store.add(baseFixture);
    store.setRemoteAccess('d1', true);
    expect(store.list()[0].remoteAllowed).toBe(true);
    store.setRemoteAccess('d1', false);
    expect(store.list()[0].remoteAllowed).toBe(false);
  });

  it('setRemoteAccess is a no-op for unknown deviceId', () => {
    const fake = makeFakeStore();
    const store = new DeviceStore(fake as any);
    store.add(baseFixture);
    store.setRemoteAccess('unknown', true);
    expect(store.list()[0].remoteAllowed).toBe(false);
  });

  it('rename preserves all other fields', () => {
    const fake = makeFakeStore();
    const store = new DeviceStore(fake as any);
    store.add(baseFixture);
    store.rename('d1', 'new-name');
    const [d] = store.list();
    expect(d.deviceTokenHash).toBe('h');
    expect(d.phoneIdentityPub).toBe('PIP');
    expect(d.sid).toBe('SID');
    expect(d.epoch).toBe(1);
  });
});
