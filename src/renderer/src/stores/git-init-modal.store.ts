import { create } from 'zustand';

interface GitInitModalState {
  isOpen: boolean;
  projectPath: string;
  openPrompt: (projectPath: string) => void;
  close: () => void;
}

export const useGitInitModalStore = create<GitInitModalState>((set) => ({
  isOpen: false,
  projectPath: '',

  openPrompt: (projectPath) => set({ isOpen: true, projectPath }),
  close: () => set({ isOpen: false, projectPath: '' }),
}));
