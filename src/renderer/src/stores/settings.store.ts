import { create } from 'zustand';
import type { AppSettings } from '@shared/types';

export type SettingsSection =
  | 'general'
  | 'agents'
  | 'workspace'
  | 'mobile'
  | 'integrations'
  | 'about';

interface SettingsStoreState {
  isOpen: boolean;
  activeSection: SettingsSection;
  settings: AppSettings | null;
  dismissedFirstRunBannerProjects: Set<string>;

  open: (section?: SettingsSection) => void;
  close: () => void;
  setActiveSection: (section: SettingsSection) => void;
  hydrate: () => Promise<void>;
  setFromEvent: (settings: AppSettings) => void;
  dismissFirstRunBanner: (projectPath: string) => void;
  isFirstRunBannerDismissed: (projectPath: string) => boolean;
}

export const useSettingsStore = create<SettingsStoreState>((set, get) => ({
  isOpen: false,
  activeSection: 'general',
  settings: null,
  dismissedFirstRunBannerProjects: new Set(),

  open: (section) =>
    set((state) => ({
      isOpen: true,
      activeSection: section ?? state.activeSection,
    })),

  close: () => set({ isOpen: false }),

  setActiveSection: (section) => set({ activeSection: section }),

  async hydrate() {
    try {
      const settings = await window.office.getSettings();
      set({ settings });
    } catch (err) {
      console.warn('[settings.store] hydrate failed:', err);
    }
  },

  setFromEvent: (settings) => set({ settings }),

  dismissFirstRunBanner: (projectPath) =>
    set((state) => {
      const next = new Set(state.dismissedFirstRunBannerProjects);
      next.add(projectPath);
      return { dismissedFirstRunBannerProjects: next };
    }),

  isFirstRunBannerDismissed: (projectPath) => {
    return get().dismissedFirstRunBannerProjects.has(projectPath);
  },
}));
