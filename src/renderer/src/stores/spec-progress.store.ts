import { create } from 'zustand';

export type SpecPhaseStatus = 'queued' | 'active' | 'done';

interface SpecPhase {
  name: string;
  status: SpecPhaseStatus;
}

interface SpecProgressStore {
  phases: Map<string, SpecPhase>;
  visible: boolean;
  addPhase(id: string, name: string): void;
  setStatus(id: string, status: SpecPhaseStatus): void;
  hide(): void;
  reset(): void;
}

export const useSpecProgressStore = create<SpecProgressStore>((set) => ({
  phases: new Map(),
  visible: false,

  addPhase(id, name) {
    set((state) => {
      if (state.phases.has(id)) return state;
      const next = new Map(state.phases);
      next.set(id, { name, status: 'queued' });
      return { phases: next, visible: true };
    });
  },

  setStatus(id, status) {
    set((state) => {
      const phase = state.phases.get(id);
      if (!phase) return state;
      const next = new Map(state.phases);
      next.set(id, { ...phase, status });
      return { phases: next };
    });
  },

  hide() {
    set({ visible: false });
  },

  reset() {
    set({ phases: new Map(), visible: false });
  },
}));
