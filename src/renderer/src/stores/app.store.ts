import { create } from 'zustand';
import { useOfficeStore } from './office.store';
import { useChatStore } from './chat.store';
import { useKanbanStore } from './kanban.store';

type Screen = 'lobby' | 'office';

interface AppState {
  screen: Screen;
  selectedSessionId: string | null;
  selectedSessionTitle: string | null;
  navigateToOffice: (sessionId: string, title: string) => void;
  navigateToLobby: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  screen: 'lobby',
  selectedSessionId: null,
  selectedSessionTitle: null,

  navigateToOffice: (sessionId, title) => {
    useOfficeStore.getState().reset();
    useChatStore.getState().reset();
    set({ screen: 'office', selectedSessionId: sessionId, selectedSessionTitle: title });
  },

  navigateToLobby: () => {
    useOfficeStore.getState().reset();
    useChatStore.getState().reset();
    useKanbanStore.getState().reset();
    set({ screen: 'lobby', selectedSessionId: null, selectedSessionTitle: null });
  },
}));
