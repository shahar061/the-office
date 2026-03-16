import { create } from 'zustand';
import type { AgentRole, AgentEvent } from '@shared/types';

export type CharacterState = 'idle' | 'walking' | 'typing' | 'reading';

export interface CharacterInfo {
  role: AgentRole;
  state: CharacterState;
  toolName?: string;
  lastActive: number;
}

interface OfficeStore {
  characters: Map<AgentRole, CharacterInfo>;
  activeAgents: Set<AgentRole>;
  handleAgentEvent: (event: AgentEvent) => void;
}

const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch']);

export const useOfficeStore = create<OfficeStore>((set) => ({
  characters: new Map(),
  activeAgents: new Set(),
  handleAgentEvent: (event) => set((state) => {
    const chars = new Map(state.characters);
    const active = new Set(state.activeAgents);
    const role = event.agentRole;
    if (event.type === 'agent:created') {
      chars.set(role, { role, state: 'idle', lastActive: event.timestamp });
      active.add(role);
    } else if (event.type === 'agent:tool:start') {
      const charState = READ_TOOLS.has(event.toolName || '') ? 'reading' : 'typing';
      chars.set(role, { role, state: charState, toolName: event.toolName, lastActive: event.timestamp });
    } else if (event.type === 'agent:tool:done') {
      const existing = chars.get(role);
      if (existing) chars.set(role, { ...existing, state: 'idle', toolName: undefined, lastActive: event.timestamp });
    } else if (event.type === 'agent:closed') {
      const existing = chars.get(role);
      if (existing) chars.set(role, { ...existing, state: 'idle', lastActive: event.timestamp });
      active.delete(role);
    }
    return { characters: chars, activeAgents: active };
  }),
}));
