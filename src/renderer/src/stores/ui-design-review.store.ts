import { create } from 'zustand';
import type { UIDesignMockup } from '@shared/types';

interface UIDesignReviewStore {
  isOpen: boolean;
  designDirection: string;
  mockups: UIDesignMockup[];

  openReview(payload: { designDirection: string; mockups: UIDesignMockup[] }): void;
  closeReview(): void;
}

export const useUIDesignReviewStore = create<UIDesignReviewStore>((set) => ({
  isOpen: false,
  designDirection: '',
  mockups: [],

  openReview: ({ designDirection, mockups }) =>
    set({ isOpen: true, designDirection, mockups }),
  closeReview: () => set({ isOpen: false, designDirection: '', mockups: [] }),
}));
