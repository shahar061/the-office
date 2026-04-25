// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuthChip } from '../../src/renderer/src/components/AppChromeCluster/AuthChip';
import { useProjectStore } from '../../src/renderer/src/stores/project.store';
import { useApiKeyPanelStore } from '../../src/renderer/src/stores/api-key-panel.store';

beforeEach(() => {
  useProjectStore.setState({
    authStatus: { connected: false },
    projectState: null,
  } as any);
  useApiKeyPanelStore.setState({ isOpen: false });
});

describe('AuthChip', () => {
  it('shows "Not connected" + dot when not connected', () => {
    render(<AuthChip />);
    expect(screen.getByText(/Not connected/)).toBeTruthy();
  });

  it('shows account email when connected', () => {
    useProjectStore.setState({
      authStatus: { connected: true, account: 'foo@example.com' },
      projectState: null,
    } as any);
    render(<AuthChip />);
    expect(screen.getByText('foo@example.com')).toBeTruthy();
  });

  it('clicking when disconnected opens api-key panel store', () => {
    render(<AuthChip />);
    fireEvent.click(screen.getByText(/Not connected/));
    expect(useApiKeyPanelStore.getState().isOpen).toBe(true);
  });

  it('disabled (no-op click) when connected', () => {
    useProjectStore.setState({
      authStatus: { connected: true, account: 'foo@example.com' },
      projectState: null,
    } as any);
    render(<AuthChip />);
    const btn = screen.getByText('foo@example.com').closest('button')!;
    expect(btn.disabled).toBe(true);
  });
});
