import { create } from 'zustand';
import type { PairedDevice } from '../../../../shared/types';

interface MobileBridgeState {
  status: { running: boolean; port: number | null; connectedDevices: number } | null;
  devices: PairedDevice[];
  pendingQR: { qrPayload: string; expiresAt: number } | null;
  loading: boolean;
  refresh: () => Promise<void>;
  generateQR: () => Promise<void>;
  clearQR: () => void;
  revoke: (deviceId: string) => Promise<void>;
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

  generateQR: async () => {
    const qr = await window.office.mobile.getPairingQR();
    set({ pendingQR: qr });
  },

  clearQR: () => set({ pendingQR: null }),

  revoke: async (deviceId: string) => {
    await window.office.mobile.revokeDevice(deviceId);
    await get().refresh();
  },
}));
