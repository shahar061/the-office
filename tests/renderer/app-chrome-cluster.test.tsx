// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppChromeCluster } from '../../src/renderer/src/components/AppChromeCluster';
import { useProjectStore } from '../../src/renderer/src/stores/project.store';
import { useSettingsStore } from '../../src/renderer/src/stores/settings.store';
import { useMobileBridgeStore } from '../../src/renderer/src/stores/mobile-bridge.store';

declare global {
  // eslint-disable-next-line no-var
  var window: any;
}

beforeEach(() => {
  globalThis.window.office = {
    saveSettings: vi.fn().mockImplementation(async (patch: any) => ({
      language: patch.language ?? 'en',
      _isDevMode: false,
    })),
    getSettings: vi.fn(),
    openExternal: vi.fn(),
  };

  useProjectStore.setState({
    projectState: null,
    authStatus: { connected: false },
  } as any);

  useSettingsStore.setState({
    settings: { language: 'en', devMode: false, _isDevMode: false } as any,
    isOpen: false,
  } as any);

  useMobileBridgeStore.setState({ status: null });
});

describe('AppChromeCluster', () => {
  it('renders ⚙️ + EN/HE + AuthChip on picker (projectState=null)', () => {
    render(<AppChromeCluster />);
    expect(screen.getByText('⚙️')).toBeTruthy();
    expect(screen.getByText(/EN|HE/)).toBeTruthy();
    expect(screen.getByText(/Not connected/)).toBeTruthy();
  });

  it('renders HeaderStatusPill when projectState is non-null', () => {
    useProjectStore.setState({
      projectState: { name: 'Test', path: '/x', currentPhase: 'imagine', completedPhases: [] },
      authStatus: { connected: true, account: 'foo@example.com' },
    } as any);
    render(<AppChromeCluster />);
    expect(screen.getByText('⚙️')).toBeTruthy();
    expect(screen.queryByText(/Not connected/)).toBeNull();
    expect(screen.getByText('📱 Pair a phone')).toBeTruthy();
  });
});
