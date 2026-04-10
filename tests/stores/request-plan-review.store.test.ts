import { describe, it, expect, beforeEach } from 'vitest';
import { useRequestPlanReviewStore } from '../../src/renderer/src/stores/request-plan-review.store';

describe('useRequestPlanReviewStore', () => {
  beforeEach(() => {
    useRequestPlanReviewStore.getState().closeReview();
  });

  it('starts closed', () => {
    const state = useRequestPlanReviewStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.requestId).toBeNull();
    expect(state.title).toBe('');
    expect(state.planMarkdown).toBe('');
  });

  it('openReview populates fields and sets isOpen', () => {
    useRequestPlanReviewStore.getState().openReview({
      requestId: 'req-001',
      title: 'Add dark mode',
      plan: '## Summary\ntoggle',
    });
    const state = useRequestPlanReviewStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.requestId).toBe('req-001');
    expect(state.title).toBe('Add dark mode');
    expect(state.planMarkdown).toBe('## Summary\ntoggle');
  });

  it('closeReview clears state', () => {
    useRequestPlanReviewStore.getState().openReview({
      requestId: 'req-001',
      title: 'x',
      plan: 'y',
    });
    useRequestPlanReviewStore.getState().closeReview();
    const state = useRequestPlanReviewStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.requestId).toBeNull();
    expect(state.title).toBe('');
    expect(state.planMarkdown).toBe('');
  });
});
