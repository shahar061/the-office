import { describe, it, expect, beforeEach } from 'vitest';
import { useWarTableStore } from '../../src/renderer/src/stores/war-table.store';

describe('WarTableStore', () => {
  beforeEach(() => {
    useWarTableStore.getState().reset();
  });

  it('starts with empty state', () => {
    const state = useWarTableStore.getState();
    expect(state.visualState).toBe('empty');
    expect(state.milestones).toEqual([]);
    expect(state.tasks).toEqual([]);
    expect(state.reviewContent).toBeNull();
  });

  it('adds a milestone card', () => {
    useWarTableStore.getState().addCard({
      id: 'm1', type: 'milestone', title: 'Core API',
    });
    const state = useWarTableStore.getState();
    expect(state.milestones).toHaveLength(1);
    expect(state.milestones[0].title).toBe('Core API');
  });

  it('adds a task card grouped under milestone', () => {
    useWarTableStore.getState().addCard({
      id: 'm1', type: 'milestone', title: 'Core API',
    });
    useWarTableStore.getState().addCard({
      id: 't1', type: 'task', title: 'Auth middleware', parentId: 'm1',
    });
    const state = useWarTableStore.getState();
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0].parentId).toBe('m1');
  });

  it('sets visual state', () => {
    useWarTableStore.getState().setVisualState('growing');
    expect(useWarTableStore.getState().visualState).toBe('growing');
  });

  it('sets review content and opens overlay', () => {
    useWarTableStore.getState().setReviewContent('# Plan\n\nPhase 1...', 'plan');
    const state = useWarTableStore.getState();
    expect(state.reviewContent).toBe('# Plan\n\nPhase 1...');
    expect(state.reviewArtifact).toBe('plan');
    expect(state.reviewOpen).toBe(true);
  });

  it('closes review overlay', () => {
    useWarTableStore.getState().setReviewContent('content', 'plan');
    useWarTableStore.getState().closeReview();
    expect(useWarTableStore.getState().reviewOpen).toBe(false);
  });

  it('reset clears all state', () => {
    useWarTableStore.getState().addCard({ id: 'm1', type: 'milestone', title: 'X' });
    useWarTableStore.getState().setVisualState('complete');
    useWarTableStore.getState().reset();
    const state = useWarTableStore.getState();
    expect(state.visualState).toBe('empty');
    expect(state.milestones).toEqual([]);
    expect(state.tasks).toEqual([]);
  });
});
