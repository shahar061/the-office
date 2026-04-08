import { create } from 'zustand';
import type { KanbanState, KanbanTask } from '@shared/types';

const INITIAL_KANBAN: KanbanState = {
  projectName: '',
  currentPhase: '',
  completionPercent: 0,
  tasks: [],
};

interface KanbanStore {
  kanban: KanbanState;
  setKanban: (state: KanbanState) => void;
  reset: () => void;
  // Derived helpers
  tasksByStatus: (status: KanbanTask['status']) => KanbanTask[];
  failedTask: () => KanbanTask | undefined;
}

export const useKanbanStore = create<KanbanStore>((set, get) => ({
  kanban: { ...INITIAL_KANBAN },
  setKanban: (state) => set({ kanban: state }),
  reset: () => set({ kanban: { ...INITIAL_KANBAN } }),
  tasksByStatus: (status) => get().kanban.tasks.filter(t => t.status === status),
  failedTask: () => {
    const { kanban } = get();
    if (!kanban.failedTaskId) return undefined;
    return kanban.tasks.find(t => t.id === kanban.failedTaskId);
  },
}));
