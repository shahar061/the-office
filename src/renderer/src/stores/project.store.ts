import { create } from 'zustand';
import type { PhaseInfo, ProjectState, AuthStatus } from '@shared/types';
import { useOfficeStore } from './office.store';
import { audioManager } from '../audio/AudioManager';

interface ProjectStore {
  authStatus: AuthStatus;
  projectState: ProjectState | null;
  currentPhase: PhaseInfo | null;
  warRoomIntroActive: boolean;
  setAuthStatus: (status: AuthStatus) => void;
  setProjectState: (state: ProjectState | null) => void;
  setPhaseInfo: (info: PhaseInfo) => void;
  setWarRoomIntroActive: (active: boolean) => void;
}

export const useProjectStore = create<ProjectStore>((set) => ({
  authStatus: { connected: false },
  projectState: null,
  currentPhase: null,
  warRoomIntroActive: false,
  setAuthStatus: (status) => set({ authStatus: status }),
  setProjectState: (state) => set({ projectState: state }),
  setWarRoomIntroActive: (active) => set({ warRoomIntroActive: active }),
  setPhaseInfo: (info) =>
    set((state) => {
      const ps = state.projectState;

      const TERMINAL = ['completed', 'failed', 'interrupted'];
      if (TERMINAL.includes(info.status)) {
        useOfficeStore.getState().clearAgentActivity();
      }

      // Play phase SFX
      if (info.status === 'active') {
        audioManager.playSfx('phase-start');
      } else if (info.status === 'completed') {
        audioManager.playSfx('phase-complete');
      }

      // Activate warroom intro when warroom phase starts
      const warRoomIntroActive =
        info.phase === 'warroom' && info.status === 'active'
          ? true
          : state.warRoomIntroActive;

      if (!ps) return { currentPhase: info, warRoomIntroActive };

      const completedPhases =
        info.status === 'completed' && !ps.completedPhases.includes(info.phase)
          ? [...ps.completedPhases, info.phase]
          : ps.completedPhases;

      return {
        currentPhase: info,
        warRoomIntroActive,
        projectState: {
          ...ps,
          currentPhase: info.phase,
          completedPhases,
        },
      };
    }),
}));
