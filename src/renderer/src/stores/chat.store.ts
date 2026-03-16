import { create } from 'zustand';
import type { ChatMessage, AgentRole, AgentWaitingPayload, AskQuestion } from '@shared/types';

interface ChatStore {
  messages: ChatMessage[];
  waitingForResponse: boolean;
  waitingAgentRole: AgentRole | null;
  waitingSessionId: string | null;
  waitingQuestions: AskQuestion[];
  addMessage: (msg: ChatMessage) => void;
  clearMessages: () => void;
  setWaiting: (payload: AgentWaitingPayload | null) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  waitingForResponse: false,
  waitingAgentRole: null,
  waitingSessionId: null,
  waitingQuestions: [],
  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
  clearMessages: () => set({ messages: [] }),
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
