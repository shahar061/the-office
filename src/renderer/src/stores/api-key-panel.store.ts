import { create } from 'zustand';

interface ApiKeyPanelStore {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useApiKeyPanelStore = create<ApiKeyPanelStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
