import { create } from 'zustand';
import type { StatsState } from '@shared/types';

interface StatsStore {
  stats: StatsState | null;
  setStats: (state: StatsState) => void;
  reset: () => void;
}

export const useStatsStore = create<StatsStore>((set) => ({
  stats: null,
  setStats: (state) => set({ stats: state }),
  reset: () => set({ stats: null }),
}));
