import { create } from 'zustand';

interface UIStore {
  isExpanded: boolean;
  activeTab: 'chat' | 'office';
  toggleExpanded: () => void;
  setActiveTab: (tab: 'chat' | 'office') => void;
}

export const useUIStore = create<UIStore>((set) => ({
  isExpanded: false,
  activeTab: 'chat' as const,
  toggleExpanded: () =>
    set((state) => ({
      isExpanded: !state.isExpanded,
      // Always reset to chat tab when expanding
      activeTab: state.isExpanded ? state.activeTab : 'chat',
    })),
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
