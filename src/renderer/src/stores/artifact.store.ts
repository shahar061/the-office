import { create } from 'zustand';
import type { AgentRole, UIDesignMockup } from '@shared/types';

export interface ArtifactInfo {
  key: string;
  filename: string;
  label: string;
  agentRole: AgentRole;
  available: boolean;
}

interface ArtifactStoreState {
  artifacts: ArtifactInfo[];
  openArtifact: { key: string; content: string } | null;
  uiDesigns: UIDesignMockup[];
  markAvailable: (key: string) => void;
  openDocument: (key: string, content: string) => void;
  closeDocument: () => void;
  reset: () => void;
  hydrateFromStatus: (status: Record<string, boolean>) => void;
  setUIDesigns: (mockups: UIDesignMockup[]) => void;
}

const INITIAL_ARTIFACTS: ArtifactInfo[] = [
  { key: 'vision-brief', filename: '01-vision-brief.md', label: 'Vision Brief', agentRole: 'ceo', available: false },
  { key: 'prd', filename: '02-prd.md', label: 'PRD', agentRole: 'product-manager', available: false },
  { key: 'market-analysis', filename: '03-market-analysis.md', label: 'Market Analysis', agentRole: 'market-researcher', available: false },
  { key: 'system-design', filename: '04-system-design.md', label: 'System Design', agentRole: 'chief-architect', available: false },
];

export const useArtifactStore = create<ArtifactStoreState>((set) => ({
  artifacts: INITIAL_ARTIFACTS.map((a) => ({ ...a })),
  openArtifact: null,
  uiDesigns: [],

  markAvailable: (key) =>
    set((state) => ({
      artifacts: state.artifacts.map((a) => (a.key === key ? { ...a, available: true } : a)),
    })),

  openDocument: (key, content) => set({ openArtifact: { key, content } }),
  closeDocument: () => set({ openArtifact: null }),

  reset: () =>
    set({
      artifacts: INITIAL_ARTIFACTS.map((a) => ({ ...a })),
      openArtifact: null,
      uiDesigns: [],
    }),

  hydrateFromStatus: (status) =>
    set((state) => ({
      artifacts: state.artifacts.map((a) => ({
        ...a,
        available: status[a.filename] === true,
      })),
    })),

  setUIDesigns: (mockups) => set({ uiDesigns: mockups }),
}));
