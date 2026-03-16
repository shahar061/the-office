import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from '../../src/renderer/src/stores/chat.store';

describe('ChatStore waiting state', () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [],
      waitingForResponse: false,
      waitingAgentRole: null,
      waitingSessionId: null,
      waitingQuestions: [],
    });
  });

  it('setWaiting sets waiting state from payload', () => {
    useChatStore.getState().setWaiting({
      sessionId: 'session-1',
      agentRole: 'ceo',
      questions: [{ question: 'What?', header: 'Q', options: [], multiSelect: false }],
    });
    const state = useChatStore.getState();
    expect(state.waitingForResponse).toBe(true);
    expect(state.waitingAgentRole).toBe('ceo');
    expect(state.waitingSessionId).toBe('session-1');
    expect(state.waitingQuestions).toHaveLength(1);
  });

  it('setWaiting(null) clears waiting state', () => {
    useChatStore.getState().setWaiting({
      sessionId: 'session-1',
      agentRole: 'ceo',
      questions: [],
    });
    useChatStore.getState().setWaiting(null);
    const state = useChatStore.getState();
    expect(state.waitingForResponse).toBe(false);
    expect(state.waitingAgentRole).toBeNull();
    expect(state.waitingSessionId).toBeNull();
    expect(state.waitingQuestions).toHaveLength(0);
  });
});
