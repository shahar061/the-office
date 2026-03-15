import { create } from 'zustand';
import type { TerminalConfig, AppSettings } from '../../../../shared/types';

interface SettingsState {
  terminals: TerminalConfig[];
  defaultTerminalId: string;
  isLoaded: boolean;
  isOpen: boolean;
  load: () => Promise<void>;
  addTerminal: (config: TerminalConfig) => Promise<void>;
  removeTerminal: (id: string) => Promise<void>;
  setDefault: (id: string) => Promise<void>;
  detectTerminals: () => Promise<TerminalConfig[]>;
  browseAndAdd: () => Promise<void>;
  open: () => void;
  close: () => void;
}

function persist(state: { terminals: TerminalConfig[]; defaultTerminalId: string }) {
  const settings: AppSettings = {
    terminals: state.terminals,
    defaultTerminalId: state.defaultTerminalId,
  };
  window.office?.saveSettings(settings).catch((err: unknown) => {
    console.error('[Settings] Failed to persist:', err);
  });
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  terminals: [],
  defaultTerminalId: '',
  isLoaded: false,
  isOpen: false,

  load: async () => {
    const settings = await window.office.getSettings();
    set({
      terminals: settings.terminals,
      defaultTerminalId: settings.defaultTerminalId,
      isLoaded: true,
    });
  },

  addTerminal: async (config) => {
    const { terminals } = get();
    if (terminals.some(t => t.id === config.id)) return;
    const updated = [...terminals, config];
    set({ terminals: updated });
    persist({ terminals: updated, defaultTerminalId: get().defaultTerminalId });
  },

  removeTerminal: async (id) => {
    const { terminals, defaultTerminalId } = get();
    const target = terminals.find(t => t.id === id);
    if (!target || target.isBuiltIn) return;
    const updated = terminals.filter(t => t.id !== id);
    const newDefault = defaultTerminalId === id ? 'terminal' : defaultTerminalId;
    set({ terminals: updated, defaultTerminalId: newDefault });
    persist({ terminals: updated, defaultTerminalId: newDefault });
  },

  setDefault: async (id) => {
    set({ defaultTerminalId: id });
    persist({ terminals: get().terminals, defaultTerminalId: id });
  },

  detectTerminals: async () => {
    const detected = await window.office.detectTerminals();
    for (const t of detected) {
      await get().addTerminal(t);
    }
    return detected;
  },

  browseAndAdd: async () => {
    const result = await window.office.browseTerminalApp();
    if (result) {
      await get().addTerminal(result);
    }
  },

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
