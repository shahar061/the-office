import { create } from 'zustand';
import type {
  AgentEvent,
  ChatMessage,
  SessionSnapshot,
  SessionStatePatch,
} from '../../shared/types';

const CHAT_TAIL_CAP = 50;

interface MobileSessionState {
  snapshot: SessionSnapshot | null;
  pendingEvents: AgentEvent[];
  setSnapshot: (snapshot: SessionSnapshot) => void;
  appendEvent: (event: AgentEvent) => void;
  drainPendingEvents: () => AgentEvent[];
  appendChat: (messages: ChatMessage[]) => void;
  applyStatePatch: (patch: SessionStatePatch) => void;
}

export const useMobileSessionStore = create<MobileSessionState>((set, get) => ({
  snapshot: null,
  pendingEvents: [],

  setSnapshot: (snapshot) => set({ snapshot, pendingEvents: [] }),

  appendEvent: (event) => {
    set((state) => ({ pendingEvents: [...state.pendingEvents, event] }));
  },

  drainPendingEvents: () => {
    const events = get().pendingEvents;
    set({ pendingEvents: [] });
    return events;
  },

  appendChat: (messages) => {
    const current = get().snapshot;
    if (!current) return;
    const merged = [...current.chatTail, ...messages];
    const trimmed = merged.length > CHAT_TAIL_CAP ? merged.slice(merged.length - CHAT_TAIL_CAP) : merged;
    set({ snapshot: { ...current, chatTail: trimmed } });
  },

  applyStatePatch: (patch) => {
    const current = get().snapshot;
    if (!current) return;
    switch (patch.kind) {
      case 'phase':       set({ snapshot: { ...current, phase: patch.phase } }); break;
      case 'activeAgent': set({ snapshot: { ...current, activeAgentId: patch.agentId } }); break;
      case 'ended':       set({ snapshot: { ...current, sessionEnded: patch.ended } }); break;
    }
  },
}));
