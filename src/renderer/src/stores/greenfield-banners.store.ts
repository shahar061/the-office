import { create } from 'zustand';

export interface GreenfieldBanner {
  id: string;
  level: 'info' | 'warning';
  /** English fallback rendered when `key` is absent. */
  message: string;
  /** When set, the renderer translates this with useT() instead of using `message`. */
  key?: string;
  vars?: Record<string, string | number>;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface GreenfieldBannersState {
  banners: GreenfieldBanner[];
  dismissedForProject: Set<string>;

  addBanner: (banner: GreenfieldBanner) => void;
  dismissBanner: (id: string) => void;
  dismissForProject: (projectPath: string) => void;
  isDismissedForProject: (projectPath: string) => boolean;
  reset: () => void;
}

export const useGreenfieldBannersStore = create<GreenfieldBannersState>((set, get) => ({
  banners: [],
  dismissedForProject: new Set(),

  addBanner: (banner) =>
    set((state) => {
      const existing = state.banners.findIndex((b) => b.id === banner.id);
      if (existing !== -1) {
        const next = [...state.banners];
        next[existing] = banner;
        return { banners: next };
      }
      return { banners: [...state.banners, banner] };
    }),

  dismissBanner: (id) =>
    set((state) => ({
      banners: state.banners.filter((b) => b.id !== id),
    })),

  dismissForProject: (projectPath) =>
    set((state) => {
      const next = new Set(state.dismissedForProject);
      next.add(projectPath);
      return { dismissedForProject: next };
    }),

  isDismissedForProject: (projectPath) => {
    return get().dismissedForProject.has(projectPath);
  },

  reset: () => set({ banners: [], dismissedForProject: new Set() }),
}));
