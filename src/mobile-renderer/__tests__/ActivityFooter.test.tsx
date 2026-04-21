/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { useSessionStore } from '../../../shared/stores/session.store';
import type { SessionSnapshot } from '../../../shared/types';
import { ActivityFooter } from '../ActivityFooter';

const BASE: SessionSnapshot = {
  sessionActive: false,
  sessionId: 's', desktopName: 'd', phase: 'idle', startedAt: 0,
  activeAgentId: null, characters: [], chatTail: [], sessionEnded: false,
};

function setChars(chars: SessionSnapshot['characters']): void {
  useSessionStore.setState({ snapshot: { ...BASE, characters: chars } });
}

describe('ActivityFooter', () => {
  beforeEach(() => {
    useSessionStore.setState({ snapshot: null });
  });

  it('renders nothing when no snapshot', () => {
    const { container } = render(<ActivityFooter />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when no character has currentTool', () => {
    setChars([
      { agentId: 'a1', agentRole: 'ceo', activity: 'idle' },
    ]);
    const { container } = render(<ActivityFooter />);
    expect(container.firstChild).toBeNull();
  });

  it('renders "<Name> is reading foo.ts" when the first active character has a Read tool', () => {
    setChars([
      { agentId: 'a1', agentRole: 'backend-engineer', activity: 'reading',
        currentTool: { toolName: 'Read', target: 'foo.ts' } },
    ]);
    const { getByText } = render(<ActivityFooter />);
    expect(getByText(/is reading foo\.ts/i)).toBeTruthy();
  });

  it('renders without target if target is missing', () => {
    setChars([
      { agentId: 'a1', agentRole: 'backend-engineer', activity: 'typing',
        currentTool: { toolName: 'Bash' } },
    ]);
    const { container } = render(<ActivityFooter />);
    expect(container.textContent).toMatch(/is running\u2026?/);
    expect(container.textContent).not.toMatch(/undefined/);
  });

  it('shows the first active character when multiple have currentTool', () => {
    setChars([
      { agentId: 'a1', agentRole: 'backend-engineer', activity: 'reading',
        currentTool: { toolName: 'Read', target: 'foo.ts' } },
      { agentId: 'a2', agentRole: 'frontend-engineer', activity: 'typing',
        currentTool: { toolName: 'Write', target: 'bar.tsx' } },
    ]);
    const { getByText } = render(<ActivityFooter />);
    expect(getByText(/foo\.ts/)).toBeTruthy();
  });
});
