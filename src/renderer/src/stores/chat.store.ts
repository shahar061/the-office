import { create } from 'zustand';
import type { AgentEvent, AgentRole } from '../../../shared/types';

export type Phase = 'imagine' | 'warroom' | 'build';

export interface ChatMessage {
  id: string;
  role: AgentRole | 'user' | 'system';
  content: string;
  timestamp: number;
}

interface ChatState {
  messages: ChatMessage[];
  currentPhase: Phase;
  totalCost: number;
  totalTokens: number;
  isDispatching: boolean;
  handleAgentEvent: (event: AgentEvent) => void;
  addUserMessage: (content: string) => void;
  setPhase: (phase: Phase) => void;
  setDispatching: (v: boolean) => void;
  reset: () => void;
}

let messageCounter = 0;

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  currentPhase: 'imagine',
  totalCost: 0,
  totalTokens: 0,
  isDispatching: false,

  handleAgentEvent: (event: AgentEvent) => {
    set((state) => {
      if (event.type === 'agent:message' && event.message) {
        return {
          messages: [...state.messages, {
            id: `msg-${++messageCounter}`,
            role: event.agentRole,
            content: event.message,
            timestamp: event.timestamp,
          }],
        };
      }
      if (event.type === 'session:cost:update') {
        return {
          totalCost: event.cost ?? state.totalCost,
          totalTokens: event.tokens ?? state.totalTokens,
        };
      }
      return {};
    });
  },

  addUserMessage: (content: string) => {
    set((state) => ({
      messages: [...state.messages, {
        id: `msg-${++messageCounter}`,
        role: 'user',
        content,
        timestamp: Date.now(),
      }],
    }));
  },

  setPhase: (phase: Phase) => set({ currentPhase: phase }),
  setDispatching: (v: boolean) => set({ isDispatching: v }),
  reset: () => {
    messageCounter = 0;
    return set({ messages: [], currentPhase: 'imagine', totalCost: 0, totalTokens: 0, isDispatching: false });
  },
}));