import { create } from 'zustand';
import type { WarTableVisualState, WarTableCard } from '@shared/types';
import { audioManager } from '../audio/AudioManager';

interface WarTableStoreState {
  visualState: WarTableVisualState;
  milestones: WarTableCard[];
  tasks: WarTableCard[];
  reviewContent: string | null;
  reviewArtifact: 'plan' | 'tasks' | null;
  reviewOpen: boolean;

  setVisualState: (state: WarTableVisualState) => void;
  addCard: (card: WarTableCard) => void;
  setReviewContent: (content: string, artifact: 'plan' | 'tasks') => void;
  closeReview: () => void;
  reset: () => void;
}

export const useWarTableStore = create<WarTableStoreState>((set) => ({
  visualState: 'empty',
  milestones: [],
  tasks: [],
  reviewContent: null,
  reviewArtifact: null,
  reviewOpen: false,

  setVisualState: (visualState) => {
    if (visualState === 'review') {
      audioManager.playSfx('review-ready');
    }
    set({ visualState });
  },

  addCard: (card) =>
    set((state) => {
      audioManager.playSfx('card-pinned');
      if (card.type === 'milestone') {
        return { milestones: [...state.milestones, card] };
      }
      return { tasks: [...state.tasks, card] };
    }),

  setReviewContent: (content, artifact) =>
    set({ reviewContent: content, reviewArtifact: artifact, reviewOpen: true }),

  closeReview: () => set({ reviewOpen: false }),

  reset: () =>
    set({
      visualState: 'empty',
      milestones: [],
      tasks: [],
      reviewContent: null,
      reviewArtifact: null,
      reviewOpen: false,
    }),
}));
