import { create } from 'zustand';
import type { PhaseInfo, ProjectState, AuthStatus } from '@shared/types';

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
  setPhaseInfo: (info) => set({ currentPhase: info }),
}));
