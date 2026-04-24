// shared/stores/session.store.ts — Unified session store for mobile-renderer and Expo
import { create } from 'zustand';
import type {
  AgentEvent,
  CharacterState,
  ChatMessage,
  Phase,
  PhaseHistory,
  SessionSnapshot,
  SessionStatePatch,
} from '../types';


interface SessionState {
  snapshot: SessionSnapshot | null;
  pendingEvents: AgentEvent[];
  characterStates: Map<string, CharacterState>;
  lastCharStateTs: number;
  viewedPhase: Phase | null;
  phaseHistoryCache: Partial<Record<Phase, PhaseHistory[]>>;
  lastVisitedAtByPhase: Partial<Record<Phase, number>>;
  setSnapshot: (s: SessionSnapshot) => void;
  appendEvent: (e: AgentEvent) => void;
  drainPendingEvents: () => AgentEvent[];
  appendChat: (messages: ChatMessage[]) => void;
  applyStatePatch: (patch: SessionStatePatch) => void;
  applyCharState: (ts: number, states: CharacterState[]) => void;
  clearCharStates: () => void;
  clear: () => void;
  setViewedPhase: (phase: Phase) => void;
  setPhaseHistory: (phase: Phase, history: PhaseHistory[]) => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  snapshot: null,
  pendingEvents: [],
  characterStates: new Map<string, CharacterState>(),
  lastCharStateTs: 0,
  viewedPhase: null,
  phaseHistoryCache: {},
  lastVisitedAtByPhase: {},

  setSnapshot: (snapshot) => set((state) => {
    const oldPhase = state.snapshot?.phase ?? null;
    const newPhase = snapshot.phase;

    // Scope change to inactive clears all view state.
    if (!snapshot.sessionActive) {
      return {
        snapshot,
        pendingEvents: [],
        viewedPhase: null,
        phaseHistoryCache: {},
        lastVisitedAtByPhase: {},
      };
    }

    // Auto-follow rule: if user was on the old current phase, advance.
    let viewedPhase = state.viewedPhase;
    if (viewedPhase === null) {
      viewedPhase = newPhase;
    } else if (oldPhase !== null && viewedPhase === oldPhase && oldPhase !== newPhase) {
      viewedPhase = newPhase;
    }

    return { snapshot, pendingEvents: [], viewedPhase };
  }),

  appendEvent: (event) => set((state) => ({ pendingEvents: [...state.pendingEvents, event] })),

  drainPendingEvents: () => {
    const events = get().pendingEvents;
    set({ pendingEvents: [] });
    return events;
  },

  appendChat: (messages) => {
    const current = get().snapshot;
    if (!current) return;
    set({ snapshot: { ...current, chatTail: [...current.chatTail, ...messages] } });
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
      case 'archivedRuns': {
        const next: SessionSnapshot = { ...current, archivedRuns: patch.runs };
        if (patch.resetTail) next.chatTail = [];
        set({ snapshot: next });
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

  clear: () => set({
    snapshot: null,
    pendingEvents: [],
    viewedPhase: null,
    phaseHistoryCache: {},
    lastVisitedAtByPhase: {},
  }),

  setViewedPhase: (phase) => set((state) => ({
    viewedPhase: phase,
    lastVisitedAtByPhase: { ...state.lastVisitedAtByPhase, [phase]: Date.now() },
  })),

  setPhaseHistory: (phase, history) => set((state) => ({
    phaseHistoryCache: { ...state.phaseHistoryCache, [phase]: history },
  })),
}));
