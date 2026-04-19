/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useSessionStore } from '../../../shared/stores/session.store';
import type { ChatMessage, SessionSnapshot } from '../../../shared/types';

// Stub MessageBubble so the test isolates ChatView's wiring (empty state
// render, map-over-messages render, auto-scroll effect) from
// react-markdown's DOM output.
vi.mock('../../renderer/src/components/OfficeView/MessageBubble', () => ({
  MessageBubble: ({ msg }: { msg: ChatMessage; isWaiting: boolean }) => (
    <div data-testid="mb" data-msg-id={msg.id}>{msg.text}</div>
  ),
}));

import { ChatView } from '../ChatView';

const BASE_SNAPSHOT: SessionSnapshot = {
  sessionId: 's',
  desktopName: 'test',
  phase: 'idle',
  startedAt: 1,
  activeAgentId: null,
  characters: [],
  chatTail: [],
  sessionEnded: false,
};

function setSnapshot(chatTail: ChatMessage[]): void {
  useSessionStore.setState({ snapshot: { ...BASE_SNAPSHOT, chatTail } });
}

describe('ChatView', () => {
  beforeEach(() => {
    useSessionStore.setState({ snapshot: null, pendingEvents: [] });
  });

  it('renders the empty state when chatTail is empty', () => {
    setSnapshot([]);
    const { getByText } = render(<ChatView />);
    expect(getByText('No messages yet.')).toBeTruthy();
  });

  it('renders one MessageBubble per message in chatTail', () => {
    setSnapshot([
      { id: 'm1', role: 'user', text: 'hi', timestamp: 10 },
      { id: 'm2', role: 'agent', agentRole: 'ceo', text: 'hello', timestamp: 20 },
      { id: 'm3', role: 'system', text: '---', timestamp: 30 },
    ]);
    const { getAllByTestId } = render(<ChatView />);
    const bubbles = getAllByTestId('mb');
    expect(bubbles).toHaveLength(3);
    expect(bubbles.map((b) => b.getAttribute('data-msg-id'))).toEqual(['m1', 'm2', 'm3']);
  });

  it('auto-scrolls the list to the bottom when a new message arrives', () => {
    setSnapshot([{ id: 'm1', role: 'user', text: 'hi', timestamp: 10 }]);
    const { container, rerender } = render(<ChatView />);
    const list = container.querySelector('.chat-list') as HTMLDivElement;
    // jsdom computes 0 for both values; force non-zero so the assertion is meaningful.
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 500 });
    list.scrollTop = 0;
    setSnapshot([
      { id: 'm1', role: 'user', text: 'hi', timestamp: 10 },
      { id: 'm2', role: 'agent', text: 'yo', timestamp: 20 },
    ]);
    rerender(<ChatView />);
    expect(list.scrollTop).toBe(500);
  });
});
