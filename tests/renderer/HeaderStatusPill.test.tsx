// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { HeaderStatusPill } from '../../src/renderer/src/components/HeaderStatusPill/HeaderStatusPill';
import { useMobileBridgeStore } from '../../src/renderer/src/stores/mobile-bridge.store';

type Device = {
  deviceId: string;
  deviceName: string;
  mode: 'lan' | 'relay' | 'offline';
  lastSeenAt: number;
  remoteAllowed: boolean;
};

function setDevices(devices: Device[]) {
  useMobileBridgeStore.setState({
    status: {
      running: true,
      port: 0,
      connectedDevices: devices.length,
      pendingSas: null,
      v1DeviceCount: 0,
      relay: 'ready',
      relayPausedUntil: null,
      lanHost: null,
      devices,
    },
  });
}

describe('HeaderStatusPill label derivation', () => {
  beforeEach(() => {
    // Reset store before each test
    useMobileBridgeStore.setState({ status: null });
  });

  it('shows "Pair a phone" when no devices are connected', () => {
    setDevices([]);
    render(<HeaderStatusPill />);
    expect(screen.getByText(/Pair a phone/)).toBeTruthy();
  });

  it('shows "<name> · Local" for one LAN device', () => {
    setDevices([{ deviceId: 'd', deviceName: 'iPhone', mode: 'lan', lastSeenAt: 1, remoteAllowed: false }]);
    render(<HeaderStatusPill />);
    expect(screen.getByText('iPhone · Local')).toBeTruthy();
  });

  it('shows "<name> · Remote" for one Relay device', () => {
    setDevices([{ deviceId: 'd', deviceName: 'iPhone', mode: 'relay', lastSeenAt: 1, remoteAllowed: true }]);
    render(<HeaderStatusPill />);
    expect(screen.getByText('iPhone · Remote')).toBeTruthy();
  });

  it('shows "📱 N phones · Local+Remote" for mixed modes', () => {
    setDevices([
      { deviceId: 'a', deviceName: 'A', mode: 'lan', lastSeenAt: 1, remoteAllowed: false },
      { deviceId: 'b', deviceName: 'B', mode: 'relay', lastSeenAt: 1, remoteAllowed: true },
    ]);
    render(<HeaderStatusPill />);
    expect(screen.getByText('📱 2 phones · Local+Remote')).toBeTruthy();
  });
});
