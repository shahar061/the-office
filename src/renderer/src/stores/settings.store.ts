import { create } from 'zustand';
import type { AppSettings, AppSettingsForRenderer } from '@shared/types';
import { setCurrentLanguage } from '../i18n';

const UNLOCK_COUNT = 7;
const TAP_RESET_MS = 2000;

export type SettingsSection =
  | 'general'
  | 'language'
  | 'appearance'
  | 'agents'
  | 'workspace'
  | 'mobile'
  | 'integrations'
  | 'about';

interface SettingsStoreState {
  isOpen: boolean;
  activeSection: SettingsSection;
  settings: AppSettingsForRenderer | null;
  dismissedFirstRunBannerProjects: Set<string>;

  versionTapCount: number;
  versionLastTapAt: number | null;
  isDevMode: boolean;

  open: (section?: SettingsSection) => void;
  close: () => void;
  setActiveSection: (section: SettingsSection) => void;
  hydrate: () => Promise<void>;
  setFromEvent: (settings: AppSettingsForRenderer) => void;
  setLanguage: (lang: 'en' | 'he' | 'es' | 'it' | 'de' | 'pt') => Promise<void>;
  setTheme: (theme: import('@shared/types').ThemeId) => Promise<void>;
  bumpVersionTap: () => Promise<{ unlocked: boolean; remaining: number }>;
  enableDevMode: () => Promise<void>;
  disableDevMode: () => Promise<void>;
  dismissFirstRunBanner: (projectPath: string) => void;
  isFirstRunBannerDismissed: (projectPath: string) => boolean;
}

export const useSettingsStore = create<SettingsStoreState>((set, get) => ({
  isOpen: false,
  activeSection: 'general',
  settings: null,
  dismissedFirstRunBannerProjects: new Set(),

  versionTapCount: 0,
  versionLastTapAt: null,
  isDevMode: false,

  open: (section) =>
    set((state) => ({
      isOpen: true,
      activeSection: section ?? state.activeSection,
    })),

  close: () => set({ isOpen: false }),

  setActiveSection: (section) => set({ activeSection: section }),

  async hydrate() {
    try {
      const settings = (await window.office.getSettings()) as AppSettingsForRenderer;
      setCurrentLanguage(settings.language ?? 'en');
      set({ settings, isDevMode: settings._isDevMode === true });
    } catch (err) {
      console.warn('[settings.store] hydrate failed:', err);
    }
  },

  setFromEvent: (settings) =>
    set({ settings, isDevMode: settings._isDevMode === true }),

  setLanguage: async (lang) => {
    setCurrentLanguage(lang);
    const next = (await window.office.saveSettings({ language: lang })) as AppSettingsForRenderer;
    set({ settings: next, isDevMode: next._isDevMode === true });
  },

  setTheme: async (theme) => {
    const next = (await window.office.saveSettings({ appearance: { theme } } as Partial<AppSettings>)) as AppSettingsForRenderer;
    set({ settings: next, isDevMode: next._isDevMode === true });
  },

  bumpVersionTap: async () => {
    const now = Date.now();
    const state = get();
    let count = state.versionTapCount;
    if (state.versionLastTapAt && now - state.versionLastTapAt > TAP_RESET_MS) {
      count = 0;
    }
    count += 1;
    set({ versionTapCount: count, versionLastTapAt: now });

    if (count >= UNLOCK_COUNT) {
      await get().enableDevMode();
      set({ versionTapCount: 0, versionLastTapAt: null });
      return { unlocked: true, remaining: 0 };
    }
    return { unlocked: false, remaining: UNLOCK_COUNT - count };
  },

  enableDevMode: async () => {
    const next = (await window.office.saveSettings({ devMode: true } as Partial<AppSettings>)) as AppSettingsForRenderer;
    set({ settings: next, isDevMode: next._isDevMode === true });
  },

  disableDevMode: async () => {
    const next = (await window.office.saveSettings({ devMode: false } as Partial<AppSettings>)) as AppSettingsForRenderer;
    set({ settings: next, isDevMode: next._isDevMode === true });
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
