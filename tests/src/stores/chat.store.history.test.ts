import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from '@/renderer/src/stores/chat.store';
import type { PhaseHistory, ChatMessage } from '@shared/types';

function makeMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: `msg-${Date.now()}-${Math.random()}`,
    role: 'agent',
    agentRole: 'ceo',
    text: 'Hello',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('chat.store – history', () => {
  beforeEach(() => {
    useChatStore.getState().clearMessages();
  });

  describe('loadHistory', () => {
    it('populates messages with latest run from all agents', () => {
      const history: PhaseHistory[] = [
        {
          agentRole: 'ceo',
          runs: [
            { runNumber: 1, messages: [makeMsg({ text: 'ceo old', timestamp: 100 })] },
            { runNumber: 2, messages: [makeMsg({ text: 'ceo new', timestamp: 200 })] },
          ],
        },
        {
          agentRole: 'product-manager',
          runs: [
            { runNumber: 1, messages: [makeMsg({ text: 'pm msg', timestamp: 300, agentRole: 'product-manager' })] },
          ],
        },
      ];

      useChatStore.getState().loadHistory(history);

      const { messages, archivedRuns } = useChatStore.getState();
      expect(messages).toHaveLength(2);
      expect(messages[0].text).toBe('ceo new');
      expect(messages[1].text).toBe('pm msg');

      expect(archivedRuns).toHaveLength(1);
      expect(archivedRuns[0].agentRole).toBe('ceo');
      expect(archivedRuns[0].runNumber).toBe(1);
    });

    it('handles single run per agent (no archived)', () => {
      const history: PhaseHistory[] = [
        {
          agentRole: 'ceo',
          runs: [
            { runNumber: 1, messages: [makeMsg({ text: 'only run', timestamp: 100 })] },
          ],
        },
      ];

      useChatStore.getState().loadHistory(history);

      const { messages, archivedRuns } = useChatStore.getState();
      expect(messages).toHaveLength(1);
      expect(messages[0].text).toBe('only run');
      expect(archivedRuns).toHaveLength(0);
    });

    it('handles empty history', () => {
      useChatStore.getState().loadHistory([]);

      const { messages, archivedRuns } = useChatStore.getState();
      expect(messages).toHaveLength(0);
      expect(archivedRuns).toHaveLength(0);
    });

    it('orders messages by timestamp across agents', () => {
      const history: PhaseHistory[] = [
        {
          agentRole: 'product-manager',
          runs: [{ runNumber: 1, messages: [makeMsg({ text: 'pm', timestamp: 200, agentRole: 'product-manager' })] }],
        },
        {
          agentRole: 'ceo',
          runs: [{ runNumber: 1, messages: [makeMsg({ text: 'ceo', timestamp: 100 })] }],
        },
      ];

      useChatStore.getState().loadHistory(history);
      const { messages } = useChatStore.getState();
      expect(messages[0].text).toBe('ceo');
      expect(messages[1].text).toBe('pm');
    });
  });

  describe('clearMessages', () => {
    it('clears both messages and archivedRuns', () => {
      const history: PhaseHistory[] = [
        {
          agentRole: 'ceo',
          runs: [
            { runNumber: 1, messages: [makeMsg({ text: 'old', timestamp: 100 })] },
            { runNumber: 2, messages: [makeMsg({ text: 'new', timestamp: 200 })] },
          ],
        },
      ];

      useChatStore.getState().loadHistory(history);
      expect(useChatStore.getState().messages.length).toBeGreaterThan(0);
      expect(useChatStore.getState().archivedRuns.length).toBeGreaterThan(0);

      useChatStore.getState().clearMessages();

      expect(useChatStore.getState().messages).toEqual([]);
      expect(useChatStore.getState().archivedRuns).toEqual([]);
    });
  });
});
