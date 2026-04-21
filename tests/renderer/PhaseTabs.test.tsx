// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PhaseTabs } from '../../src/renderer/src/components/OfficeView/PhaseTabs';

describe('PhaseTabs', () => {
  const noUnread = { idle: false, imagine: false, warroom: false, build: false, complete: false };

  it('renders four tabs with their labels', () => {
    render(<PhaseTabs
      currentPhase="imagine"
      viewedPhase="imagine"
      completedPhases={[]}
      unreadByPhase={noUnread}
      onSelect={() => {}}
    />);
    expect(screen.queryByText('Imagine')).not.toBeNull();
    expect(screen.queryByText('War Room')).not.toBeNull();
    expect(screen.queryByText('Build')).not.toBeNull();
    expect(screen.queryByText('Complete')).not.toBeNull();
  });

  it('disables unreached phases', () => {
    render(<PhaseTabs
      currentPhase="imagine"
      viewedPhase="imagine"
      completedPhases={[]}
      unreadByPhase={noUnread}
      onSelect={() => {}}
    />);
    const build = screen.getByText('Build').closest('button');
    const warroom = screen.getByText('War Room').closest('button');
    expect(build?.disabled).toBe(true);
    expect(warroom?.disabled).toBe(true);
  });

  it('enables current and completed phases', () => {
    render(<PhaseTabs
      currentPhase="build"
      viewedPhase="build"
      completedPhases={['imagine', 'warroom']}
      unreadByPhase={noUnread}
      onSelect={() => {}}
    />);
    expect(screen.getByText('Imagine').closest('button')?.disabled).toBe(false);
    expect(screen.getByText('War Room').closest('button')?.disabled).toBe(false);
    expect(screen.getByText('Build').closest('button')?.disabled).toBe(false);
    expect(screen.getByText('Complete').closest('button')?.disabled).toBe(true);
  });

  it('fires onSelect with the clicked phase', () => {
    const onSelect = vi.fn();
    render(<PhaseTabs
      currentPhase="warroom"
      viewedPhase="warroom"
      completedPhases={['imagine']}
      unreadByPhase={noUnread}
      onSelect={onSelect}
    />);
    fireEvent.click(screen.getByText('Imagine'));
    expect(onSelect).toHaveBeenCalledWith('imagine');
  });

  it('shows a badge dot on unread tabs', () => {
    const { container } = render(<PhaseTabs
      currentPhase="warroom"
      viewedPhase="imagine"
      completedPhases={['imagine']}
      unreadByPhase={{ ...noUnread, warroom: true }}
      onSelect={() => {}}
    />);
    const badges = container.querySelectorAll('[data-testid="phase-tab-badge"]');
    expect(badges.length).toBe(1);
  });
});
