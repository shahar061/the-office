import { create } from 'zustand';

interface ApiKeyPanelState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useApiKeyPanelStore = create<ApiKeyPanelState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
