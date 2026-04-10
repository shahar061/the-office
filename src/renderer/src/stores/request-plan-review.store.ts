import { create } from 'zustand';

interface RequestPlanReviewState {
  isOpen: boolean;
  requestId: string | null;
  title: string;
  planMarkdown: string;
  openReview: (payload: { requestId: string; title: string; plan: string }) => void;
  closeReview: () => void;
}

export const useRequestPlanReviewStore = create<RequestPlanReviewState>((set) => ({
  isOpen: false,
  requestId: null,
  title: '',
  planMarkdown: '',

  openReview: ({ requestId, title, plan }) =>
    set({ isOpen: true, requestId, title, planMarkdown: plan }),

  closeReview: () =>
    set({ isOpen: false, requestId: null, title: '', planMarkdown: '' }),
}));
