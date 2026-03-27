import { create } from 'zustand';
import type { AgentRole } from '@shared/types';
import { AGENT_COLORS } from '@shared/types';
import { AGENT_CONFIGS } from '../office/characters/agents.config';

import adamUrl from '../assets/characters/Adam_walk.png?url';
import alexUrl from '../assets/characters/Alex_walk.png?url';
import ameliaUrl from '../assets/characters/Amelia_walk.png?url';
import bobUrl from '../assets/characters/Bob_walk.png?url';

const SPRITE_SHEET_URLS: Record<string, string> = {
  adam: adamUrl,
  alex: alexUrl,
  amelia: ameliaUrl,
  bob: bobUrl,
};

export interface AgentInfo {
  role: AgentRole;
  displayName: string;
  description: string;
  prompt: string;
  tools: string[];
  color: string;
  group: 'leadership' | 'coordination' | 'engineering';
  spriteVariant: string;
  idleZone: string;
  spriteSheetUrl: string;
}

interface AgentsStore {
  agents: AgentInfo[];
  selectedAgent: AgentRole | null;
  loaded: boolean;
  loadAgents: () => Promise<void>;
  selectAgent: (role: AgentRole) => void;
  clearSelection: () => void;
}

export const useAgentsStore = create<AgentsStore>((set, get) => ({
  agents: [],
  selectedAgent: null,
  loaded: false,

  loadAgents: async () => {
    if (get().loaded) return;
    const defs = await window.office.getAgentDefinitions();
    const agents: AgentInfo[] = [];

    for (const [name, def] of Object.entries(defs)) {
      const config = AGENT_CONFIGS[name as AgentRole];
      if (!config) continue;

      agents.push({
        role: name as AgentRole,
        displayName: config.displayName,
        description: def.description,
        prompt: def.prompt,
        tools: def.tools,
        color: AGENT_COLORS[name as AgentRole],
        group: config.group,
        spriteVariant: config.spriteVariant,
        idleZone: config.idleZone,
        spriteSheetUrl: SPRITE_SHEET_URLS[config.spriteVariant] ?? '',
      });
    }

    set({ agents, loaded: true });
  },

  selectAgent: (role) => set({ selectedAgent: role }),
  clearSelection: () => set({ selectedAgent: null }),
}));
