import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from '../../../src/renderer/src/stores/chat.store';
import type { AgentEvent } from '../../../shared/types';

function makeEvent(overrides: Partial<AgentEvent> = {}): AgentEvent {
  return {
    agentId: 'agent-1',
    agentRole: 'ceo',
    source: 'sdk',
    type: 'agent:message',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('ChatStore', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it('starts with empty messages and imagine phase', () => {
    const state = useChatStore.getState();
    expect(state.messages).toEqual([]);
    expect(state.currentPhase).toBe('imagine');
  });

  it('adds user message via addUserMessage', () => {
    useChatStore.getState().addUserMessage('Hello world');
    const messages = useChatStore.getState().messages;
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('Hello world');
  });

  it('adds agent message on agent:message event', () => {
    useChatStore.getState().handleAgentEvent(makeEvent({
      type: 'agent:message',
      message: 'I have a plan',
    }));
    const messages = useChatStore.getState().messages;
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('ceo');
    expect(messages[0].content).toBe('I have a plan');
  });

  it('updates cost on session:cost:update', () => {
    useChatStore.getState().handleAgentEvent(makeEvent({
      type: 'session:cost:update',
      cost: 0.42,
      tokens: 12400,
    }));
    expect(useChatStore.getState().totalCost).toBe(0.42);
    expect(useChatStore.getState().totalTokens).toBe(12400);
  });

  it('allows phase to be set manually', () => {
    useChatStore.getState().setPhase('warroom');
    expect(useChatStore.getState().currentPhase).toBe('warroom');
  });

  it('ignores non-message events', () => {
    useChatStore.getState().handleAgentEvent(makeEvent({ type: 'agent:tool:start' }));
    expect(useChatStore.getState().messages).toHaveLength(0);
  });
});