/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import type { ChatMessage, ArchivedRun } from '../../../shared/types';

// Stub MessageBubble so we don't pull in react-markdown for this test.
vi.mock('../../renderer/src/components/OfficeView/MessageBubble', () => ({
  MessageBubble: ({ msg }: { msg: ChatMessage }) => (
    <div data-testid="inner-bubble">{msg.text}</div>
  ),
}));

import { ArchivedRunsList } from '../ArchivedRunsList';

function mkRun(partial: Partial<ArchivedRun> = {}): ArchivedRun {
  return {
    agentRole: 'ceo',
    runNumber: 1,
    messages: [{ id: 'm1', role: 'agent', text: 'hello', timestamp: 100 }],
    timestamp: 100,
    ...partial,
  };
}

describe('ArchivedRunsList', () => {
  it('returns null when runs is empty', () => {
    const { container } = render(<ArchivedRunsList runs={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one collapsible header per run with role, number, count, date', () => {
    const runs = [
      mkRun({ runNumber: 1, agentRole: 'ceo', messages: [
        { id: 'm1', role: 'agent', text: 'a', timestamp: 100 },
        { id: 'm2', role: 'agent', text: 'b', timestamp: 110 },
      ] }),
    ];
    const { getByText } = render(<ArchivedRunsList runs={runs} />);
    // Role + run number
    expect(getByText(/Run 1/)).toBeTruthy();
    // Message count
    expect(getByText(/2 msgs/)).toBeTruthy();
  });

  it('clicking a header toggles the body visibility', () => {
    const runs = [mkRun({ runNumber: 7 })];
    const { getByText, queryAllByTestId } = render(<ArchivedRunsList runs={runs} />);
    expect(queryAllByTestId('inner-bubble')).toHaveLength(0);
    fireEvent.click(getByText(/Run 7/));
    expect(queryAllByTestId('inner-bubble')).toHaveLength(1);
    fireEvent.click(getByText(/Run 7/));
    expect(queryAllByTestId('inner-bubble')).toHaveLength(0);
  });

  it('multiple runs: expanding one does not affect the others', () => {
    const runs = [
      mkRun({ runNumber: 1, messages: [{ id: 'm1', role: 'agent', text: 'A', timestamp: 100 }] }),
      mkRun({ runNumber: 2, messages: [{ id: 'm2', role: 'agent', text: 'B', timestamp: 200 }] }),
    ];
    const { getByText, queryAllByTestId } = render(<ArchivedRunsList runs={runs} />);
    fireEvent.click(getByText(/Run 1/));
    expect(queryAllByTestId('inner-bubble')).toHaveLength(1);
    fireEvent.click(getByText(/Run 2/));
    expect(queryAllByTestId('inner-bubble')).toHaveLength(2);
  });
});
