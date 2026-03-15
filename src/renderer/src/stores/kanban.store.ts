import { create } from 'zustand';
import type { KanbanState } from '@shared/types';

interface KanbanStore {
  kanban: KanbanState;
  setKanban: (state: KanbanState) => void;
}

export const useKanbanStore = create<KanbanStore>((set) => ({
  kanban: { projectName: '', currentPhase: '', completionPercent: 0, tasks: [] },
  setKanban: (state) => set({ kanban: state }),
}));
