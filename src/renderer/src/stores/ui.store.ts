import { create } from 'zustand';

export type AppTab = 'chat' | 'office' | 'agents' | 'logs' | 'about';

interface UIStore {
  isExpanded: boolean;
  activeTab: AppTab;
  toggleExpanded: () => void;
  setActiveTab: (tab: AppTab) => void;
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
