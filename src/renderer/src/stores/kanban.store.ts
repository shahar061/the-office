import { create } from 'zustand';
import type { KanbanState } from '@shared/types';

const INITIAL_KANBAN: KanbanState = { projectName: '', currentPhase: '', completionPercent: 0, tasks: [] };

interface KanbanStore {
  kanban: KanbanState;
  setKanban: (state: KanbanState) => void;
  reset: () => void;
}

export const useKanbanStore = create<KanbanStore>((set) => ({
  kanban: { ...INITIAL_KANBAN },
  setKanban: (state) => set({ kanban: state }),
  reset: () => set({ kanban: { ...INITIAL_KANBAN } }),
}));
