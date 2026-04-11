import { create } from 'zustand';
import type { TransportStatus } from '../transport/transport.interface';

interface ConnectionState {
  status: TransportStatus;
  setStatus: (s: TransportStatus) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  status: { state: 'idle' },
  setStatus: (status) => set({ status }),
}));
