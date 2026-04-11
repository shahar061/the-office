import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useSettingsStore } from '../../src/renderer/src/stores/settings.store';

const mockGetSettings = vi.fn();
const mockSaveSettings = vi.fn();

beforeEach(() => {
  (global as any).window = (global as any).window ?? {};
  (global as any).window.office = {
    getSettings: mockGetSettings,
    saveSettings: mockSaveSettings,
  };
  useSettingsStore.getState().close();
  useSettingsStore.setState({ settings: null, dismissedFirstRunBannerProjects: new Set() });
  mockGetSettings.mockReset();
  mockSaveSettings.mockReset();
});

afterEach(() => {
  useSettingsStore.getState().close();
});

describe('useSettingsStore', () => {
  it('starts closed with no settings', () => {
    const state = useSettingsStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.activeSection).toBe('general');
    expect(state.settings).toBeNull();
    expect(state.dismissedFirstRunBannerProjects.size).toBe(0);
  });

  it('open() sets isOpen true', () => {
    useSettingsStore.getState().open();
    expect(useSettingsStore.getState().isOpen).toBe(true);
  });

  it('open(section) sets the active section', () => {
    useSettingsStore.getState().open('integrations');
    const state = useSettingsStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.activeSection).toBe('integrations');
  });

  it('close() sets isOpen false', () => {
    useSettingsStore.getState().open();
    useSettingsStore.getState().close();
    expect(useSettingsStore.getState().isOpen).toBe(false);
  });

  it('setActiveSection() updates section without affecting isOpen', () => {
    useSettingsStore.getState().open('general');
    useSettingsStore.getState().setActiveSection('agents');
    const state = useSettingsStore.getState();
    expect(state.activeSection).toBe('agents');
    expect(state.isOpen).toBe(true);
  });

  it('hydrate() fetches settings and caches them', async () => {
    const fakeSettings = {
      defaultModelPreset: 'fast' as const,
      defaultPermissionMode: 'auto-all' as const,
      maxParallelTLs: 7,
      gitIdentities: [],
      defaultGitIdentityId: null,
    };
    mockGetSettings.mockResolvedValueOnce(fakeSettings);
    await useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState().settings).toEqual(fakeSettings);
  });

  it('setFromEvent() updates cached settings', () => {
    const fakeSettings = {
      defaultModelPreset: 'fast' as const,
      defaultPermissionMode: 'auto-all' as const,
      maxParallelTLs: 7,
      gitIdentities: [],
      defaultGitIdentityId: null,
    };
    useSettingsStore.getState().setFromEvent(fakeSettings);
    expect(useSettingsStore.getState().settings).toEqual(fakeSettings);
  });

  it('dismissFirstRunBanner adds the project path to the set', () => {
    useSettingsStore.getState().dismissFirstRunBanner('/path/to/project');
    expect(
      useSettingsStore.getState().dismissedFirstRunBannerProjects.has('/path/to/project'),
    ).toBe(true);
  });

  it('isFirstRunBannerDismissed reflects the set', () => {
    useSettingsStore.getState().dismissFirstRunBanner('/path/to/project');
    expect(useSettingsStore.getState().isFirstRunBannerDismissed('/path/to/project')).toBe(true);
    expect(useSettingsStore.getState().isFirstRunBannerDismissed('/other')).toBe(false);
  });
});
