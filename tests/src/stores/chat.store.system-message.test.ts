import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from '../../../src/renderer/src/stores/chat.store';

describe('ChatStore.addSystemMessage', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it('adds a system message to the thread', () => {
    useChatStore.getState().addSystemMessage('Connection lost');
    const messages = useChatStore.getState().messages;
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toBe('Connection lost');
    expect(messages[0].id).toMatch(/^msg-/);
    expect(messages[0].timestamp).toBeGreaterThan(0);
  });

  it('appends system message after existing messages', () => {
    useChatStore.getState().addUserMessage('Hello');
    useChatStore.getState().addSystemMessage('Error occurred');
    const messages = useChatStore.getState().messages;
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('system');
  });
});
