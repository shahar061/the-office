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
    expect(store.list()[0]).toEqual(device);
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
    expect(store.findById('d1')).toEqual(device);
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
