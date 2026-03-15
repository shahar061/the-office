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
  selectedSessionTool: string | null;
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
  selectedSessionTool: null,
  pendingSession: null,
  dispatchInFlight: false,

  navigateToOffice: (sessionId, title) => {
    useOfficeStore.getState().reset();
    useChatStore.getState().reset();
    set({ screen: 'office', selectedSessionId: sessionId, selectedSessionTitle: title, selectedSessionTool: 'opencode' });
  },

  navigateToLobby: () => {
    useOfficeStore.getState().reset();
    useChatStore.getState().reset();
    useKanbanStore.getState().reset();
    set({
      screen: 'lobby',
      selectedSessionId: null,
      selectedSessionTitle: null,
      selectedSessionTool: null,
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
    const tool = useAppStore.getState().pendingSession?.tool ?? null;
    set({
      pendingSession: null,
      dispatchInFlight: false,
      selectedSessionId: sessionId,
      selectedSessionTitle: title,
      selectedSessionTool: tool,
    });
  },

  setDispatchInFlight: (value) => set({ dispatchInFlight: value }),
  clearDispatchInFlight: () => set({ dispatchInFlight: false }),
}));
