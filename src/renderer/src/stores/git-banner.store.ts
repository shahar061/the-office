import { create } from 'zustand';
import type { GitRecoveryNote } from '@shared/types';

interface GitBanner {
  id: string;
  level: 'info' | 'warning';
  message: string;
  requestId?: string;
}

interface GitBannerState {
  banners: GitBanner[];
  addBanner: (note: GitRecoveryNote) => void;
  dismissBanner: (id: string) => void;
  reset: () => void;
}

let nextBannerId = 1;

export const useGitBannerStore = create<GitBannerState>((set) => ({
  banners: [],

  addBanner: (note) =>
    set((state) => ({
      banners: [
        ...state.banners,
        {
          id: `banner-${nextBannerId++}`,
          level: note.level,
          message: note.message,
          requestId: note.requestId,
        },
      ],
    })),

  dismissBanner: (id) =>
    set((state) => ({ banners: state.banners.filter((b) => b.id !== id) })),

  reset: () => set({ banners: [] }),
}));
