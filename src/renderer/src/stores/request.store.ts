import { create } from 'zustand';
import type { Request } from '@shared/types';

interface RequestStore {
  requests: Request[];
  loading: boolean;

  load(): Promise<void>;
  addOrUpdate(request: Request): void;
  reset(): void;
}

export const useRequestStore = create<RequestStore>((set) => ({
  requests: [],
  loading: false,

  async load() {
    set({ loading: true });
    try {
      const list = await window.office.listRequests();
      set({ requests: list, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  addOrUpdate(request) {
    set((state) => {
      const index = state.requests.findIndex((r) => r.id === request.id);
      if (index === -1) {
        return { requests: [request, ...state.requests] };
      }
      const next = [...state.requests];
      next[index] = request;
      return { requests: next };
    });
  },

  reset() {
    set({ requests: [], loading: false });
  },
}));
