import { create } from 'zustand';
import type { PairedDevice } from '../../../../shared/types';

interface MobileStatus {
  running: boolean;
  port: number | null;
  connectedDevices: number;
  pendingSas: string | null;
  v1DeviceCount: number;
  relay: 'ready' | 'unreachable' | 'disabled' | 'paused';
  relayPausedUntil: number | null;
  lanHost: string | null;
  devices: Array<{
    deviceId: string;
    deviceName: string;
    mode: 'lan' | 'relay' | 'offline';
    lastSeenAt: number;
    remoteAllowed: boolean;
  }>;
}

interface MobileBridgeState {
  status: MobileStatus | null;
  devices: PairedDevice[];
  pendingQR: { qrPayload: string; expiresAt: number } | null;
  loading: boolean;
  refresh: () => Promise<void>;
  /** Set status directly from a push event. Avoids async refresh races where
   *  multiple in-flight getStatus() calls can resolve out of order. */
  applyStatus: (status: MobileStatus) => void;
  generateQR: () => Promise<void>;
  clearQR: () => void;
  revoke: (deviceId: string) => Promise<void>;
  // NEW actions (Plan 3 Task 6):
  renameDevice: (deviceId: string, name: string) => Promise<void>;
  setRemoteAccess: (deviceId: string, enabled: boolean) => Promise<void>;
  pauseRelay: (until: number | null) => Promise<void>;
  setLanHost: (host: string | null) => Promise<void>;
}

export const useMobileBridgeStore = create<MobileBridgeState>((set, get) => ({
  status: null,
  devices: [],
  pendingQR: null,
  loading: false,

  refresh: async () => {
    set({ loading: true });
    const [status, devices] = await Promise.all([
      window.office.mobile.getStatus(),
      window.office.mobile.listDevices(),
    ]);
    set({ status, devices, loading: false });
  },

  applyStatus: (status) => set({ status }),

  generateQR: async () => {
    const qr = await window.office.mobile.getPairingQR();
    set({ pendingQR: qr });
  },

  clearQR: () => set({ pendingQR: null }),

  revoke: async (deviceId: string) => {
    await window.office.mobile.revokeDevice(deviceId);
    await get().refresh();
  },

  renameDevice: async (deviceId, name) => {
    await window.office.mobile.renameDevice(deviceId, name);
    await get().refresh();
  },

  setRemoteAccess: async (deviceId, enabled) => {
    await window.office.mobile.setRemoteAccess(deviceId, enabled);
    await get().refresh();
  },

  pauseRelay: async (until) => {
    await window.office.mobile.pauseRelay(until);
    await get().refresh();
  },

  setLanHost: async (host) => {
    await window.office.mobile.setLanHost(host);
    await get().refresh();
  },
}));
