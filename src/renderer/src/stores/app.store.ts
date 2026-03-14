import { create } from 'zustand';
import { useOfficeStore } from './office.store';
import { useChatStore } from './chat.store';
import { useKanbanStore } from './kanban.store';

type Screen = 'lobby' | 'office';

interface PendingSession {
  tool: string;
  directory: string;
  createdAt: number;
}

interface AppState {
  screen: Screen;
  selectedSessionId: string | null;
  selectedSessionTitle: string | null;
  pendingSession: PendingSession | null;
  dispatchInFlight: boolean;
  navigateToOffice: (sessionId: string, title: string) => void;
  navigateToLobby: () => void;
  createSession: (tool: string, directory: string) => void;
  linkSession: (sessionId: string, title: string) => void;
  setDispatchInFlight: (value: boolean) => void;
  clearDispatchInFlight: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  screen: 'lobby',
  selectedSessionId: null,
  selectedSessionTitle: null,
  pendingSession: null,
  dispatchInFlight: false,

  navigateToOffice: (sessionId, title) => {
    useOfficeStore.getState().reset();
    useChatStore.getState().reset();
    set({ screen: 'office', selectedSessionId: sessionId, selectedSessionTitle: title });
  },

  navigateToLobby: () => {
    useOfficeStore.getState().reset();
    useChatStore.getState().reset();
    useKanbanStore.getState().reset();
    set({
      screen: 'lobby',
      selectedSessionId: null,
      selectedSessionTitle: null,
      pendingSession: null,
      dispatchInFlight: false,
    });
  },

  createSession: (tool, directory) => {
    useOfficeStore.getState().reset();
    useChatStore.getState().reset();
    useKanbanStore.getState().reset();
    set({
      screen: 'office',
      selectedSessionId: null,
      selectedSessionTitle: null,
      pendingSession: { tool, directory, createdAt: Date.now() },
      dispatchInFlight: false,
    });
  },

  linkSession: (sessionId, title) => {
    set({
      pendingSession: null,
      dispatchInFlight: false,
      selectedSessionId: sessionId,
      selectedSessionTitle: title,
    });
  },

  setDispatchInFlight: (value) => set({ dispatchInFlight: value }),
  clearDispatchInFlight: () => set({ dispatchInFlight: false }),
}));
