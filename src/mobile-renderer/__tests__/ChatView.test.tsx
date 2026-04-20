/**
 * @vitest-environment jsdom
 */
import React, { act } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useSessionStore } from '../../../shared/stores/session.store';
import type { ChatMessage, SessionSnapshot } from '../../../shared/types';

// Stub MessageBubble so the test isolates ChatView's wiring (empty state
// render, map-over-messages render, auto-scroll effect) from
// react-markdown's DOM output.
vi.mock('../../renderer/src/components/OfficeView/MessageBubble', () => ({
  MessageBubble: ({ msg, isWaiting }: { msg: ChatMessage; isWaiting: boolean }) => (
    <div data-testid="mb" data-msg-id={msg.id} data-waiting={String(isWaiting)}>
      {msg.text}
    </div>
  ),
}));

vi.mock('../../renderer/src/components/OfficeView/QuestionBubble', () => ({
  QuestionBubble: ({ question, onSelect }: {
    question: { question: string; options: { label: string }[] };
    onSelect: (label: string) => void;
  }) => (
    <div data-testid="qb" data-question={question.question}>
      {question.options.map((o) => (
        <button key={o.label} data-testid="qb-option" onClick={() => onSelect(o.label)}>
          {o.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('../ArchivedRunsList', () => ({
  ArchivedRunsList: ({ runs }: { runs: { runNumber: number }[] }) => (
    runs.length === 0 ? null : (
      <div className="archived-runs">
        {runs.map((r) => (<span key={r.runNumber}>Run {r.runNumber}</span>))}
      </div>
    )
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
    act(() => {
      setSnapshot([
        { id: 'm1', role: 'user', text: 'hi', timestamp: 10 },
        { id: 'm2', role: 'agent', text: 'yo', timestamp: 20 },
      ]);
    });
    rerender(<ChatView />);
    expect(list.scrollTop).toBe(500);
  });

  it('passes isWaiting=true to the last bubble when snapshot.waiting is set', () => {
    useSessionStore.setState({
      snapshot: {
        ...BASE_SNAPSHOT,
        chatTail: [
          { id: 'm1', role: 'user', text: 'hi', timestamp: 10 },
          { id: 'm2', role: 'agent', text: 'yo', timestamp: 20 },
        ],
        waiting: { sessionId: 's1', agentRole: 'ceo', questions: [] },
      },
    });
    const { getAllByTestId } = render(<ChatView />);
    const bubbles = getAllByTestId('mb');
    expect(bubbles[0].getAttribute('data-waiting')).toBe('false');
    expect(bubbles[1].getAttribute('data-waiting')).toBe('true');
  });

  it('passes isWaiting=false to all bubbles when waiting is unset', () => {
    setSnapshot([{ id: 'm1', role: 'user', text: 'hi', timestamp: 10 }]);
    const { getAllByTestId } = render(<ChatView />);
    expect(getAllByTestId('mb')[0].getAttribute('data-waiting')).toBe('false');
  });

  it('renders a PhaseSeparator between two messages with different phase', () => {
    setSnapshot([
      { id: 'm1', role: 'user', text: 'a', timestamp: 10, phase: 'imagine' },
      { id: 'm2', role: 'agent', text: 'b', timestamp: 20, phase: 'warroom' },
    ]);
    const { container } = render(<ChatView />);
    const sep = container.querySelector('.phase-separator');
    expect(sep).not.toBeNull();
    expect(sep!.textContent).toContain('War Room');
  });

  it('does NOT render a separator above the very first message', () => {
    setSnapshot([
      { id: 'm1', role: 'user', text: 'a', timestamp: 10, phase: 'imagine' },
    ]);
    const { container } = render(<ChatView />);
    expect(container.querySelectorAll('.phase-separator')).toHaveLength(0);
  });

  it('keeps the empty-state branch when chatTail is empty and no waiting', () => {
    setSnapshot([]);
    const { getByText } = render(<ChatView />);
    expect(getByText('No messages yet.')).toBeTruthy();
  });

  it('renders QuestionBubble when snapshot.waiting has options', () => {
    useSessionStore.setState({
      snapshot: {
        ...BASE_SNAPSHOT,
        chatTail: [{ id: 'm1', role: 'agent', agentRole: 'ceo', text: 'which?', timestamp: 10 }],
        waiting: {
          sessionId: 's1', agentRole: 'ceo',
          questions: [{
            question: 'Pick one', header: 'h',
            options: [{ label: 'A' }, { label: 'B' }],
            multiSelect: false,
          }],
        },
      },
    });
    const { getByText, getByTestId } = render(<ChatView />);
    expect(getByTestId('qb').getAttribute('data-question')).toBe('Pick one');
    expect(getByText('A')).toBeTruthy();
    expect(getByText('B')).toBeTruthy();
  });

  it('suppresses last-bubble isWaiting italic when interactive bubble is shown', () => {
    useSessionStore.setState({
      snapshot: {
        ...BASE_SNAPSHOT,
        chatTail: [{ id: 'm1', role: 'agent', agentRole: 'ceo', text: 'hi', timestamp: 10 }],
        waiting: {
          sessionId: 's1', agentRole: 'ceo',
          questions: [{ question: 'q', header: 'h', options: [{ label: 'A' }], multiSelect: false }],
        },
      },
    });
    const { getAllByTestId } = render(<ChatView />);
    expect(getAllByTestId('mb')[0].getAttribute('data-waiting')).toBe('false');
  });

  it('keeps isWaiting=true on last bubble when waiting has no options', () => {
    useSessionStore.setState({
      snapshot: {
        ...BASE_SNAPSHOT,
        chatTail: [{ id: 'm1', role: 'agent', agentRole: 'ceo', text: 'hi', timestamp: 10 }],
        waiting: { sessionId: 's1', agentRole: 'ceo', questions: [] },
      },
    });
    const { getAllByTestId } = render(<ChatView />);
    expect(getAllByTestId('mb')[0].getAttribute('data-waiting')).toBe('true');
  });

  it('renders ArchivedRunsList above the chatTail when snapshot.archivedRuns has entries', () => {
    useSessionStore.setState({
      snapshot: {
        ...BASE_SNAPSHOT,
        chatTail: [{ id: 'm1', role: 'user', text: 'hi', timestamp: 10 }],
        archivedRuns: [
          { agentRole: 'ceo', runNumber: 1,
            messages: [{ id: 'a1', role: 'agent', text: 'old', timestamp: 5 }], timestamp: 5 },
        ],
      },
    });
    const { container, getByText } = render(<ChatView />);
    const archivedEl = container.querySelector('.archived-runs');
    const chatList = container.querySelector('.chat-list');
    expect(archivedEl).not.toBeNull();
    expect(chatList).not.toBeNull();
    expect(getByText(/Run 1/)).toBeTruthy();
  });

  it('does NOT show empty-state when chatTail is empty but archivedRuns has entries', () => {
    useSessionStore.setState({
      snapshot: {
        ...BASE_SNAPSHOT,
        chatTail: [],
        archivedRuns: [
          { agentRole: 'ceo', runNumber: 1,
            messages: [{ id: 'a1', role: 'agent', text: 'old', timestamp: 5 }], timestamp: 5 },
        ],
      },
    });
    const { container, queryByText } = render(<ChatView />);
    expect(queryByText('No messages yet.')).toBeNull();
    expect(container.querySelector('.archived-runs')).not.toBeNull();
  });
});
