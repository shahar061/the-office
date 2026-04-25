import { create } from 'zustand';
import type { AppSettings } from '@shared/types';
import { setCurrentLanguage } from '../i18n';

export type SettingsSection =
  | 'general'
  | 'language'
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
  setLanguage: (lang: 'en' | 'he') => Promise<void>;
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
      setCurrentLanguage(settings.language ?? 'en');
      set({ settings });
    } catch (err) {
      console.warn('[settings.store] hydrate failed:', err);
    }
  },

  setFromEvent: (settings) => set({ settings }),

  setLanguage: async (lang) => {
    setCurrentLanguage(lang);
    const next = await window.office.saveSettings({ language: lang });
    set({ settings: next });
  },

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
