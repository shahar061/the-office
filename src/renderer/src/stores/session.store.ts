import { create } from 'zustand';
import type { SessionListItem } from '../../../shared/types';

interface SessionStoreState {
  sessions: SessionListItem[];
  handleSessionListUpdate: (sessions: SessionListItem[]) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionStoreState>((set) => ({
  sessions: [],
  handleSessionListUpdate: (sessions) => set({ sessions }),
  reset: () => set({ sessions: [] }),
}));
