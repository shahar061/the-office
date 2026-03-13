import { describe, it, expect, beforeEach } from 'vitest';
import { useKanbanStore } from '../../../src/renderer/src/stores/kanban.store';
import type { KanbanState } from '../../../shared/types';

const mockState: KanbanState = {
  projectName: 'The Office',
  currentPhase: 'build',
  completionPercent: 40,
  tasks: [
    { id: 't-1', description: 'Set up project', status: 'done', assignedAgent: 'devops', phaseId: 'phase-1' },
    { id: 't-2', description: 'Build UI', status: 'active', assignedAgent: 'frontend-engineer', phaseId: 'phase-2' },
    { id: 't-3', description: 'Write tests', status: 'queued', assignedAgent: 'backend-engineer', phaseId: 'phase-2' },
  ],
};

describe('KanbanStore', () => {
  beforeEach(() => {
    useKanbanStore.getState().reset();
  });

  it('starts with null state', () => {
    expect(useKanbanStore.getState().kanban).toBeNull();
  });

  it('updates state via handleKanbanUpdate', () => {
    useKanbanStore.getState().handleKanbanUpdate(mockState);
    expect(useKanbanStore.getState().kanban).toEqual(mockState);
  });

  it('replaces previous state on update', () => {
    useKanbanStore.getState().handleKanbanUpdate(mockState);
    const updated = { ...mockState, completionPercent: 80 };
    useKanbanStore.getState().handleKanbanUpdate(updated);
    expect(useKanbanStore.getState().kanban?.completionPercent).toBe(80);
  });

  it('computes task counts by status', () => {
    useKanbanStore.getState().handleKanbanUpdate(mockState);
    const counts = useKanbanStore.getState().getTaskCounts();
    expect(counts).toEqual({ queued: 1, active: 1, review: 0, done: 1, failed: 0 });
  });
});