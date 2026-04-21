// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from '../../src/renderer/src/stores/chat.store';

beforeEach(() => {
  useChatStore.setState({
    messages: [], archivedRuns: [],
    waitingForResponse: false, waitingAgentRole: null,
    waitingSessionId: null, waitingQuestions: [],
    viewedPhase: null,
    pastPhaseHistoryCache: {},
    lastVisitedAtByPhase: {},
  });
});

describe('chat.store — phase view state', () => {
  it('setViewedPhase stores the phase and timestamps the visit', () => {
    useChatStore.getState().setViewedPhase('warroom');
    const s = useChatStore.getState();
    expect(s.viewedPhase).toBe('warroom');
    expect(typeof s.lastVisitedAtByPhase.warroom).toBe('number');
  });

  it('setPastPhaseHistory populates cache', () => {
    const stub = [{ agentRole: 'ceo' as const, runs: [{ runNumber: 1, messages: [] }] }];
    useChatStore.getState().setPastPhaseHistory('imagine', stub);
    expect(useChatStore.getState().pastPhaseHistoryCache.imagine).toBe(stub);
  });

  it('handleCurrentPhaseChange applies the auto-follow rule', () => {
    useChatStore.getState().setViewedPhase('imagine');
    useChatStore.getState().handleCurrentPhaseChange('imagine', 'warroom');
    expect(useChatStore.getState().viewedPhase).toBe('warroom');
  });

  it('handleCurrentPhaseChange leaves viewedPhase when browsing past', () => {
    useChatStore.getState().setViewedPhase('imagine');
    useChatStore.getState().handleCurrentPhaseChange('warroom', 'build');
    expect(useChatStore.getState().viewedPhase).toBe('imagine');
  });
});
