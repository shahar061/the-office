import { describe, it, expect } from 'vitest';
import { selectMobileConnectedCount } from '../mobile-bridge.store';

type Device = {
  deviceId: string;
  deviceName: string;
  mode: 'lan' | 'relay' | 'offline';
  lastSeenAt: number;
  remoteAllowed: boolean;
};

function statusWith(devices: Device[]) {
  return {
    running: true, port: 0, connectedDevices: 0, pendingSas: null,
    v1DeviceCount: 0, relay: 'ready' as const, relayPausedUntil: null,
    lanHost: null, devices,
  };
}

describe('selectMobileConnectedCount', () => {
  it('returns 0 when status is null', () => {
    expect(selectMobileConnectedCount(null)).toBe(0);
  });

  it('returns 0 when no devices are present', () => {
    expect(selectMobileConnectedCount(statusWith([]))).toBe(0);
  });

  it('counts a LAN-connected device', () => {
    expect(selectMobileConnectedCount(statusWith([
      { deviceId: 'a', deviceName: 'A', mode: 'lan', lastSeenAt: 1, remoteAllowed: false },
    ]))).toBe(1);
  });

  it('counts a Remote-connected device (regression guard for the sprite bug)', () => {
    expect(selectMobileConnectedCount(statusWith([
      { deviceId: 'a', deviceName: 'A', mode: 'relay', lastSeenAt: 1, remoteAllowed: true },
    ]))).toBe(1);
  });

  it('ignores offline devices; counts mixed lan+relay+offline correctly', () => {
    expect(selectMobileConnectedCount(statusWith([
      { deviceId: 'a', deviceName: 'A', mode: 'lan', lastSeenAt: 1, remoteAllowed: false },
      { deviceId: 'b', deviceName: 'B', mode: 'relay', lastSeenAt: 1, remoteAllowed: true },
      { deviceId: 'c', deviceName: 'C', mode: 'offline', lastSeenAt: 1, remoteAllowed: true },
    ]))).toBe(2);
  });
});
