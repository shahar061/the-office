import { create } from 'zustand';
import type { ChatMessage, AgentRole, AgentWaitingPayload, AskQuestion, PhaseHistory, ArchivedRun } from '@shared/types';

interface ChatStore {
  messages: ChatMessage[];
  archivedRuns: ArchivedRun[];
  waitingForResponse: boolean;
  waitingAgentRole: AgentRole | null;
  waitingSessionId: string | null;
  waitingQuestions: AskQuestion[];
  addMessage: (msg: ChatMessage) => void;
  clearMessages: () => void;
  loadHistory: (history: PhaseHistory[]) => void;
  setWaiting: (payload: AgentWaitingPayload | null) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  archivedRuns: [],
  waitingForResponse: false,
  waitingAgentRole: null,
  waitingSessionId: null,
  waitingQuestions: [],
  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
  clearMessages: () => set({
    messages: [], archivedRuns: [],
    waitingForResponse: false, waitingAgentRole: null, waitingSessionId: null, waitingQuestions: [],
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
}));
