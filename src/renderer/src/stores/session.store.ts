import { create } from 'zustand';
import type { SessionListItem } from '../../../shared/types';

type SessionFilter = 'all' | 'opencode' | 'claude-code';

interface SessionStoreState {
  sessions: SessionListItem[];
  filter: SessionFilter;
  setFilter: (filter: SessionFilter) => void;
  handleSessionListUpdate: (sessions: SessionListItem[]) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionStoreState>((set) => ({
  sessions: [],
  filter: 'all',
  setFilter: (filter) => set({ filter }),
  handleSessionListUpdate: (sessions) => set({ sessions }),
  reset: () => set({ sessions: [], filter: 'all' }),
}));
