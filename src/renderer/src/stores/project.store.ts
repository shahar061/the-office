import { create } from 'zustand';
import type { PhaseInfo, ProjectState, AuthStatus } from '@shared/types';
import { useOfficeStore } from './office.store';

interface ProjectStore {
  authStatus: AuthStatus;
  projectState: ProjectState | null;
  currentPhase: PhaseInfo | null;
  setAuthStatus: (status: AuthStatus) => void;
  setProjectState: (state: ProjectState | null) => void;
  setPhaseInfo: (info: PhaseInfo) => void;
}

export const useProjectStore = create<ProjectStore>((set) => ({
  authStatus: { connected: false },
  projectState: null,
  currentPhase: null,
  setAuthStatus: (status) => set({ authStatus: status }),
  setProjectState: (state) => set({ projectState: state }),
  setPhaseInfo: (info) =>
    set((state) => {
      const ps = state.projectState;

      const TERMINAL = ['completed', 'failed', 'interrupted'];
      if (TERMINAL.includes(info.status)) {
        useOfficeStore.getState().clearAgentActivity();
      }

      if (!ps) return { currentPhase: info };

      const completedPhases =
        info.status === 'completed' && !ps.completedPhases.includes(info.phase)
          ? [...ps.completedPhases, info.phase]
          : ps.completedPhases;

      return {
        currentPhase: info,
        projectState: {
          ...ps,
          currentPhase: info.phase,
          completedPhases,
        },
      };
    }),
}));
