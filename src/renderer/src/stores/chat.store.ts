import { create } from 'zustand';
import type { ChatMessage, AgentRole, AgentWaitingPayload, AskQuestion, PhaseHistory, ArchivedRun, Phase } from '@shared/types';

interface ChatStore {
  messages: ChatMessage[];
  archivedRuns: ArchivedRun[];
  waitingForResponse: boolean;
  waitingAgentRole: AgentRole | null;
  waitingSessionId: string | null;
  waitingQuestions: AskQuestion[];
  viewedPhase: Phase | null;
  pastPhaseHistoryCache: Partial<Record<Phase, PhaseHistory[]>>;
  lastVisitedAtByPhase: Partial<Record<Phase, number>>;
  addMessage: (msg: ChatMessage) => void;
  clearMessages: () => void;
  loadHistory: (history: PhaseHistory[]) => void;
  setWaiting: (payload: AgentWaitingPayload | null) => void;
  setViewedPhase: (phase: Phase) => void;
  setPastPhaseHistory: (phase: Phase, history: PhaseHistory[]) => void;
  handleCurrentPhaseChange: (oldPhase: Phase, newPhase: Phase) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  archivedRuns: [],
  waitingForResponse: false,
  waitingAgentRole: null,
  waitingSessionId: null,
  waitingQuestions: [],
  viewedPhase: null,
  pastPhaseHistoryCache: {},
  lastVisitedAtByPhase: {},
  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
  clearMessages: () => set({
    messages: [], archivedRuns: [],
    waitingForResponse: false, waitingAgentRole: null, waitingSessionId: null, waitingQuestions: [],
    viewedPhase: null, pastPhaseHistoryCache: {}, lastVisitedAtByPhase: {},
  }),
  loadHistory: (history: PhaseHistory[]) => {
    const allLatestMessages: ChatMessage[] = [];
    const archived: ArchivedRun[] = [];

    for (const entry of history) {
      if (entry.runs.length === 0) continue;

      const latestRun = entry.runs[entry.runs.length - 1];
      allLatestMessages.push(...latestRun.messages);

      for (let i = 0; i < entry.runs.length - 1; i++) {
        const run = entry.runs[i];
        if (run.messages.length === 0) continue;
        archived.push({
          agentRole: entry.agentRole,
          runNumber: run.runNumber,
          messages: run.messages,
          timestamp: run.messages[0].timestamp,
        });
      }
    }

    allLatestMessages.sort((a, b) => a.timestamp - b.timestamp);
    archived.sort((a, b) => a.timestamp - b.timestamp);

    set({ messages: allLatestMessages, archivedRuns: archived });
  },
  setWaiting: (payload) =>
    payload
      ? set({
          waitingForResponse: true,
          waitingAgentRole: payload.agentRole,
          waitingSessionId: payload.sessionId,
          waitingQuestions: payload.questions,
        })
      : set({
          waitingForResponse: false,
          waitingAgentRole: null,
          waitingSessionId: null,
          waitingQuestions: [],
        }),
  setViewedPhase: (phase) => set((state) => ({
    viewedPhase: phase,
    lastVisitedAtByPhase: { ...state.lastVisitedAtByPhase, [phase]: Date.now() },
  })),
  setPastPhaseHistory: (phase, history) => set((state) => ({
    pastPhaseHistoryCache: { ...state.pastPhaseHistoryCache, [phase]: history },
  })),
  handleCurrentPhaseChange: (oldPhase, newPhase) => set((state) => {
    if (state.viewedPhase === oldPhase && oldPhase !== newPhase) {
      return { viewedPhase: newPhase };
    }
    return state;
  }),
}));
