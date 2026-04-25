// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { useSettingsStore } from '../../src/renderer/src/stores/settings.store';
import App from '../../src/renderer/src/App';

declare global {
  // eslint-disable-next-line no-var
  var window: any;
}

function setupOfficeMocks() {
  globalThis.window.office = {
    getAuthStatus: vi.fn().mockResolvedValue({ connected: false }),
    onAuthStatusChange: vi.fn().mockReturnValue(() => {}),
    getRecentProjects: vi.fn().mockResolvedValue([]),
    getProjectState: vi.fn().mockResolvedValue(null),
    onPhaseChange: vi.fn().mockReturnValue(() => {}),
    onProjectStateChanged: vi.fn().mockReturnValue(() => {}),
    onSettingsUpdated: vi.fn().mockReturnValue(() => {}),
    onOpenSettings: vi.fn().mockReturnValue(() => {}),
    getSettings: vi.fn().mockResolvedValue({ language: 'en', devMode: false, _isDevMode: false }),
    saveSettings: vi.fn(),
    onChatMessage: vi.fn().mockReturnValue(() => {}),
    onAgentEvent: vi.fn().mockReturnValue(() => {}),
    onPermissionRequest: vi.fn().mockReturnValue(() => {}),
    onAgentWaiting: vi.fn().mockReturnValue(() => {}),
    onKanbanUpdate: vi.fn().mockReturnValue(() => {}),
    onStatsUpdate: vi.fn().mockReturnValue(() => {}),
    onArtifactAvailable: vi.fn().mockReturnValue(() => {}),
    getArtifactStatus: vi.fn().mockResolvedValue({}),
    getStatsState: vi.fn().mockResolvedValue(null),
    onStatsState: vi.fn().mockReturnValue(() => {}),
    onWarTableState: vi.fn().mockReturnValue(() => {}),
    onWarTableCardAdded: vi.fn().mockReturnValue(() => {}),
    onWarTableReviewReady: vi.fn().mockReturnValue(() => {}),
    onUIDesignReviewReady: vi.fn().mockReturnValue(() => {}),
    onWarTableChoreography: vi.fn().mockReturnValue(() => {}),
    onRequestUpdated: vi.fn().mockReturnValue(() => {}),
    onRequestPlanReady: vi.fn().mockReturnValue(() => {}),
    onGitInitPrompt: vi.fn().mockReturnValue(() => {}),
    onGitRecoveryNote: vi.fn().mockReturnValue(() => {}),
    onGreenfieldGitNote: vi.fn().mockReturnValue(() => {}),
    // App.tsx calls getLayouts() when a project is open (projectState effect).
    // With projectState=null it is never invoked, but include it defensively.
    getLayouts: vi.fn().mockResolvedValue(null),
    // useRequestStore.load() calls listRequests() when a project becomes active.
    listRequests: vi.fn().mockResolvedValue([]),
    mobile: {
      onStatusChange: vi.fn().mockReturnValue(() => {}),
      getStatus: vi.fn().mockResolvedValue({}),
      // useMobileBridgeStore.refresh() calls both getStatus and listDevices.
      listDevices: vi.fn().mockResolvedValue([]),
    },
  };
}

beforeEach(() => {
  setupOfficeMocks();
  useSettingsStore.setState({ isOpen: false } as any);
});

describe('Cmd+, global shortcut', () => {
  it('Cmd+, opens settings', () => {
    render(<App />);
    expect(useSettingsStore.getState().isOpen).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', metaKey: true }));
    expect(useSettingsStore.getState().isOpen).toBe(true);
  });

  it('Ctrl+, opens settings', () => {
    render(<App />);
    expect(useSettingsStore.getState().isOpen).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', ctrlKey: true }));
    expect(useSettingsStore.getState().isOpen).toBe(true);
  });

  it('Cmd+other-key does not open settings', () => {
    render(<App />);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', metaKey: true }));
    expect(useSettingsStore.getState().isOpen).toBe(false);
  });
});
