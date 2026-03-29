import { create } from 'zustand';
import type { AgentRole, AgentEvent } from '@shared/types';
import { extractToolTarget } from '../utils';

export type CharacterState = 'idle' | 'walking' | 'typing' | 'reading';

export interface CharacterInfo {
  role: AgentRole;
  state: CharacterState;
  toolName?: string;
  lastActive: number;
}

export interface ActivityAction {
  id: string;
  toolName: string;
  target: string;
  status: 'running' | 'done';
}

interface AgentActivity {
  isActive: boolean;
  agentRole: AgentRole | null;
  actions: ActivityAction[];
}

interface OfficeStore {
  characters: Map<AgentRole, CharacterInfo>;
  activeAgents: Set<AgentRole>;
  agentActivity: AgentActivity;
  handleAgentEvent: (event: AgentEvent) => void;
  clearAgentActivity: () => void;
  reset: () => void;
}

const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch']);

const INITIAL_ACTIVITY: AgentActivity = {
  isActive: false,
  agentRole: null,
  actions: [],
};

export const useOfficeStore = create<OfficeStore>((set) => ({
  characters: new Map(),
  activeAgents: new Set(),
  agentActivity: { ...INITIAL_ACTIVITY },

  clearAgentActivity: () => set({ agentActivity: { ...INITIAL_ACTIVITY } }),
  reset: () => set({ characters: new Map(), activeAgents: new Set(), agentActivity: { ...INITIAL_ACTIVITY } }),

  handleAgentEvent: (event) => set((state) => {
    const chars = new Map(state.characters);
    const active = new Set(state.activeAgents);
    const role = event.agentRole;
    let activity = state.agentActivity;

    if (event.type === 'agent:created') {
      chars.set(role, { role, state: 'idle', lastActive: event.timestamp });
      if (role !== 'freelancer') active.add(role);
      if (event.isTopLevel) {
        activity = { isActive: true, agentRole: role, actions: [] };
      }
    } else if (event.type === 'agent:tool:start') {
      const charState = READ_TOOLS.has(event.toolName || '') ? 'reading' : 'typing';
      chars.set(role, { role, state: charState, toolName: event.toolName, lastActive: event.timestamp });

      const tool = event.toolName ?? '';
      if (tool !== 'AskUserQuestion') {
        const newAction: ActivityAction = {
          id: event.toolId ?? `${event.timestamp}`,
          toolName: tool || 'Tool',
          target: extractToolTarget(event),
          status: 'running',
        };
        const updatedActions = [...activity.actions, newAction].slice(-3);
        activity = { isActive: true, agentRole: role, actions: updatedActions };
      }
    } else if (event.type === 'agent:tool:done') {
      const existing = chars.get(role);
      if (existing) chars.set(role, { ...existing, state: 'idle', toolName: undefined, lastActive: event.timestamp });

      const updatedActions = activity.actions.map((a) =>
        a.id === event.toolId ? { ...a, status: 'done' as const } : a,
      );
      activity = { ...activity, actions: updatedActions };
    } else if (event.type === 'agent:closed') {
      const existing = chars.get(role);
      if (existing) chars.set(role, { ...existing, state: 'idle', lastActive: event.timestamp });
      active.delete(role);
    }

    return { characters: chars, activeAgents: active, agentActivity: activity };
  }),
}));
