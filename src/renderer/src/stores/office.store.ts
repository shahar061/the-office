import { create } from 'zustand';
import type { AgentEvent, AgentRole } from '../../../shared/types';
import { getAgentConfig } from '../office/characters/agents.config';

const TYPING_TOOLS = ['Write', 'Edit', 'Bash', 'NotebookEdit'];
const READING_TOOLS = ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'Agent'];

export interface AgentCharacter {
  agentId: string;
  role: AgentRole;
  state: 'idle' | 'walk' | 'type' | 'read';
  position: { x: number; y: number };
  target: { x: number; y: number } | null;
  currentTool: string | null;
  waiting: boolean;
  needsPermission: boolean;
  permissionToolId: string | null;
  message: string | null;
}

interface OfficeState {
  agents: Record<string, AgentCharacter>;
  handleAgentEvent: (event: AgentEvent) => void;
  reset: () => void;
}

function toolToState(toolName?: string): 'type' | 'read' {
  if (toolName && READING_TOOLS.includes(toolName)) return 'read';
  return 'type';
}

export const useOfficeStore = create<OfficeState>((set) => ({
  agents: {},

  handleAgentEvent: (event: AgentEvent) => {
    set((state) => {
      const agents = { ...state.agents };

      switch (event.type) {
        case 'agent:created': {
          const config = getAgentConfig(event.agentRole);
          agents[event.agentId] = {
            agentId: event.agentId,
            role: event.agentRole,
            state: 'idle',
            position: { x: config.deskTile.x * 16, y: config.deskTile.y * 16 },
            target: null,
            currentTool: null,
            waiting: false,
            needsPermission: false,
            permissionToolId: null,
            message: null,
          };
          break;
        }
        case 'agent:tool:start': {
          const agent = agents[event.agentId];
          if (agent) {
            agents[event.agentId] = {
              ...agent,
              state: toolToState(event.toolName),
              currentTool: event.toolName ?? null,
              waiting: false,
              needsPermission: false,
              permissionToolId: null,
            };
          }
          break;
        }
        case 'agent:tool:done':
        case 'agent:tool:clear': {
          const agent = agents[event.agentId];
          if (agent) {
            agents[event.agentId] = { ...agent, state: 'idle', currentTool: null };
          }
          break;
        }
        case 'agent:waiting': {
          const agent = agents[event.agentId];
          if (agent) {
            agents[event.agentId] = { ...agent, state: 'idle', waiting: true, currentTool: null };
          }
          break;
        }
        case 'agent:permission': {
          const agent = agents[event.agentId];
          if (agent) {
            agents[event.agentId] = {
              ...agent,
              needsPermission: true,
              permissionToolId: event.toolId ?? null,
            };
          }
          break;
        }
        case 'agent:message': {
          const agent = agents[event.agentId];
          if (agent) {
            agents[event.agentId] = { ...agent, message: event.message ?? null };
          }
          break;
        }
        case 'agent:closed': {
          delete agents[event.agentId];
          break;
        }
      }

      return { agents };
    });
  },

  reset: () => set({ agents: {} }),
}));