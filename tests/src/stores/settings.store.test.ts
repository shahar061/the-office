import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock window.office before importing the store
const mockGetSettings = vi.fn();
const mockSaveSettings = vi.fn();
const mockDetectTerminals = vi.fn();
const mockBrowseTerminalApp = vi.fn();

vi.stubGlobal('window', {
  office: {
    getSettings: mockGetSettings,
    saveSettings: mockSaveSettings,
    detectTerminals: mockDetectTerminals,
    browseTerminalApp: mockBrowseTerminalApp,
  },
});

import { useSettingsStore } from '../../../src/renderer/src/stores/settings.store';

describe('SettingsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store to initial state
    useSettingsStore.setState({
      terminals: [],
      defaultTerminalId: '',
      isLoaded: false,
      isOpen: false,
    });
  });

  it('starts with empty state', () => {
    const state = useSettingsStore.getState();
    expect(state.terminals).toEqual([]);
    expect(state.defaultTerminalId).toBe('');
    expect(state.isLoaded).toBe(false);
    expect(state.isOpen).toBe(false);
  });

  it('loads settings from main process', async () => {
    mockGetSettings.mockResolvedValue({
      terminals: [
        { id: 'terminal', name: 'Terminal', path: '/System/Applications/Utilities/Terminal.app', isBuiltIn: true },
      ],
      defaultTerminalId: 'terminal',
    });

    await useSettingsStore.getState().load();
    const state = useSettingsStore.getState();
    expect(state.terminals).toHaveLength(1);
    expect(state.defaultTerminalId).toBe('terminal');
    expect(state.isLoaded).toBe(true);
  });

  it('adds a terminal and persists', async () => {
    useSettingsStore.setState({
      terminals: [{ id: 'terminal', name: 'Terminal', path: '/path', isBuiltIn: true }],
      defaultTerminalId: 'terminal',
      isLoaded: true,
    });

    mockSaveSettings.mockResolvedValue(undefined);

    await useSettingsStore.getState().addTerminal({
      id: 'iterm',
      name: 'iTerm',
      path: '/Applications/iTerm.app',
      isBuiltIn: false,
    });

    const state = useSettingsStore.getState();
    expect(state.terminals).toHaveLength(2);
    expect(state.terminals[1].id).toBe('iterm');
    expect(mockSaveSettings).toHaveBeenCalledWith({
      terminals: state.terminals,
      defaultTerminalId: 'terminal',
    });
  });

  it('does not add duplicate terminal', async () => {
    useSettingsStore.setState({
      terminals: [{ id: 'terminal', name: 'Terminal', path: '/path', isBuiltIn: true }],
      defaultTerminalId: 'terminal',
      isLoaded: true,
    });

    await useSettingsStore.getState().addTerminal({
      id: 'terminal',
      name: 'Terminal',
      path: '/path',
      isBuiltIn: true,
    });

    expect(useSettingsStore.getState().terminals).toHaveLength(1);
    expect(mockSaveSettings).not.toHaveBeenCalled();
  });

  it('removes a terminal and persists', async () => {
    useSettingsStore.setState({
      terminals: [
        { id: 'terminal', name: 'Terminal', path: '/path', isBuiltIn: true },
        { id: 'iterm', name: 'iTerm', path: '/Applications/iTerm.app', isBuiltIn: false },
      ],
      defaultTerminalId: 'terminal',
      isLoaded: true,
    });

    mockSaveSettings.mockResolvedValue(undefined);

    await useSettingsStore.getState().removeTerminal('iterm');
    expect(useSettingsStore.getState().terminals).toHaveLength(1);
    expect(mockSaveSettings).toHaveBeenCalled();
  });

  it('cannot remove built-in terminal', async () => {
    useSettingsStore.setState({
      terminals: [{ id: 'terminal', name: 'Terminal', path: '/path', isBuiltIn: true }],
      defaultTerminalId: 'terminal',
      isLoaded: true,
    });

    await useSettingsStore.getState().removeTerminal('terminal');
    expect(useSettingsStore.getState().terminals).toHaveLength(1);
    expect(mockSaveSettings).not.toHaveBeenCalled();
  });

  it('resets default to terminal when removing the current default', async () => {
    useSettingsStore.setState({
      terminals: [
        { id: 'terminal', name: 'Terminal', path: '/path', isBuiltIn: true },
        { id: 'iterm', name: 'iTerm', path: '/Applications/iTerm.app', isBuiltIn: false },
      ],
      defaultTerminalId: 'iterm',
      isLoaded: true,
    });

    mockSaveSettings.mockResolvedValue(undefined);

    await useSettingsStore.getState().removeTerminal('iterm');
    expect(useSettingsStore.getState().defaultTerminalId).toBe('terminal');
  });

  it('sets default terminal and persists', async () => {
    useSettingsStore.setState({
      terminals: [
        { id: 'terminal', name: 'Terminal', path: '/path', isBuiltIn: true },
        { id: 'iterm', name: 'iTerm', path: '/Applications/iTerm.app', isBuiltIn: false },
      ],
      defaultTerminalId: 'terminal',
      isLoaded: true,
    });

    mockSaveSettings.mockResolvedValue(undefined);

    await useSettingsStore.getState().setDefault('iterm');
    expect(useSettingsStore.getState().defaultTerminalId).toBe('iterm');
    expect(mockSaveSettings).toHaveBeenCalled();
  });

  it('opens and closes modal', () => {
    useSettingsStore.getState().open();
    expect(useSettingsStore.getState().isOpen).toBe(true);
    useSettingsStore.getState().close();
    expect(useSettingsStore.getState().isOpen).toBe(false);
  });
});
