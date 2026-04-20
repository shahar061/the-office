// shared/stores/session.store.ts — Unified session store for mobile-renderer and Expo
import { create } from 'zustand';
import type {
  AgentEvent,
  CharacterState,
  ChatMessage,
  SessionSnapshot,
  SessionStatePatch,
} from '../types';

const CHAT_TAIL_CAP = 50;

interface SessionState {
  snapshot: SessionSnapshot | null;
  pendingEvents: AgentEvent[];
  characterStates: Map<string, CharacterState>;
  lastCharStateTs: number;
  setSnapshot: (s: SessionSnapshot) => void;
  hydrateFromCache: (s: SessionSnapshot) => void;
  appendEvent: (e: AgentEvent) => void;
  drainPendingEvents: () => AgentEvent[];
  appendChat: (messages: ChatMessage[]) => void;
  applyStatePatch: (patch: SessionStatePatch) => void;
  applyCharState: (ts: number, states: CharacterState[]) => void;
  clearCharStates: () => void;
  clear: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  snapshot: null,
  pendingEvents: [],
  characterStates: new Map<string, CharacterState>(),
  lastCharStateTs: 0,

  setSnapshot: (snapshot) => set({ snapshot, pendingEvents: [] }),
  hydrateFromCache: (snapshot) => set({ snapshot }),

  appendEvent: (event) => set((state) => ({ pendingEvents: [...state.pendingEvents, event] })),

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
      case 'waiting': {
        if (patch.payload) {
          set({ snapshot: { ...current, waiting: patch.payload } });
        } else {
          const { waiting: _removed, ...rest } = current;
          set({ snapshot: rest as typeof current });
        }
        break;
      }
    }
  },

  applyCharState: (ts, states) => {
    if (ts <= get().lastCharStateTs) return;
    const next = new Map<string, CharacterState>();
    for (const s of states) next.set(s.agentId, s);
    set({ characterStates: next, lastCharStateTs: ts });
  },

  clearCharStates: () => set({ characterStates: new Map(), lastCharStateTs: 0 }),

  clear: () => set({ snapshot: null, pendingEvents: [] }),
}));
