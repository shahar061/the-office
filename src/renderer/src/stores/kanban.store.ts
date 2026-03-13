import { create } from 'zustand';
import type { KanbanState } from '../../../shared/types';

interface KanbanStoreState {
  kanban: KanbanState | null;
  handleKanbanUpdate: (state: KanbanState) => void;
  getTaskCounts: () => Record<string, number>;
  reset: () => void;
}

export const useKanbanStore = create<KanbanStoreState>((set, get) => ({
  kanban: null,

  handleKanbanUpdate: (kanban: KanbanState) => set({ kanban }),

  getTaskCounts: () => {
    const kanban = get().kanban;
    if (!kanban) return { queued: 0, active: 0, review: 0, done: 0, failed: 0 };
    const counts: Record<string, number> = { queued: 0, active: 0, review: 0, done: 0, failed: 0 };
    for (const task of kanban.tasks) {
      counts[task.status] = (counts[task.status] ?? 0) + 1;
    }
    return counts;
  },

  reset: () => set({ kanban: null }),
}));