import { describe, it, expect } from 'vitest';
import { requestsToKanbanState } from '../../../../src/renderer/src/components/WorkshopPanel/request-kanban-mapper';
import type { Request } from '../../../../shared/types';

const makeRequest = (partial: Partial<Request> = {}): Request => ({
  id: 'req-001',
  title: 'Test',
  description: 'Test request',
  status: 'queued',
  createdAt: 1000,
  startedAt: null,
  completedAt: null,
  assignedAgent: null,
  result: null,
  error: null,
  plan: null,
  branchName: null,
  baseBranch: null,
  commitSha: null,
  branchIsolated: false,
  mergedAt: null,
  ...partial,
});

describe('requestsToKanbanState', () => {
  it('returns empty state for empty input', () => {
    const state = requestsToKanbanState([]);
    expect(state.tasks).toEqual([]);
    expect(state.completionPercent).toBe(0);
    expect(state.currentPhase).toBe('workshop');
  });

  it('maps a queued request to a queued task', () => {
    const state = requestsToKanbanState([makeRequest({ status: 'queued' })]);
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0].status).toBe('queued');
  });

  it('maps in_progress to active', () => {
    const state = requestsToKanbanState([makeRequest({ status: 'in_progress' })]);
    expect(state.tasks[0].status).toBe('active');
  });

  it('maps done to done', () => {
    const state = requestsToKanbanState([makeRequest({ status: 'done' })]);
    expect(state.tasks[0].status).toBe('done');
  });

  it('maps failed to failed', () => {
    const state = requestsToKanbanState([makeRequest({ status: 'failed' })]);
    expect(state.tasks[0].status).toBe('failed');
  });

  it('maps cancelled to queued as a fallback', () => {
    const state = requestsToKanbanState([makeRequest({ status: 'cancelled' })]);
    expect(state.tasks[0].status).toBe('queued');
  });

  it('uses title as description when set', () => {
    const state = requestsToKanbanState([
      makeRequest({ title: 'Add dark mode', description: 'the full text of the request that should not be the card label' }),
    ]);
    expect(state.tasks[0].description).toBe('Add dark mode');
  });

  it('falls back to truncated description when title is empty', () => {
    const longDesc = 'a'.repeat(100);
    const state = requestsToKanbanState([
      makeRequest({ title: '', description: longDesc }),
    ]);
    expect(state.tasks[0].description.length).toBeLessThanOrEqual(60);
  });

  it('uses freelancer as default agent when assignedAgent is null', () => {
    const state = requestsToKanbanState([
      makeRequest({ assignedAgent: null }),
    ]);
    expect(state.tasks[0].assignedAgent).toBe('freelancer');
  });

  it('sets phaseId to workshop', () => {
    const state = requestsToKanbanState([makeRequest()]);
    expect(state.tasks[0].phaseId).toBe('workshop');
  });

  it('sets empty dependsOn array', () => {
    const state = requestsToKanbanState([makeRequest()]);
    expect(state.tasks[0].dependsOn).toEqual([]);
  });

  it('computes completionPercent from done tasks', () => {
    const state = requestsToKanbanState([
      makeRequest({ id: 'req-001', status: 'done' }),
      makeRequest({ id: 'req-002', status: 'done' }),
      makeRequest({ id: 'req-003', status: 'in_progress' }),
      makeRequest({ id: 'req-004', status: 'queued' }),
    ]);
    expect(state.completionPercent).toBe(50);
  });

  it('includes error from failed requests', () => {
    const state = requestsToKanbanState([
      makeRequest({ status: 'failed', error: 'Build broke' }),
    ]);
    expect(state.tasks[0].error).toBe('Build broke');
  });

  it('maps awaiting_review to review', () => {
    const state = requestsToKanbanState([makeRequest({ status: 'awaiting_review' })]);
    expect(state.tasks[0].status).toBe('review');
  });
});
