import { create } from 'zustand';
import type { DiffResult } from '@shared/types';

interface DiffReviewState {
  activeRequestId: string | null;
  diff: DiffResult | null;
  loading: boolean;
  error: string | null;
  expandedFiles: Set<string>;
  confirmRejectOpen: boolean;
  accepting: boolean;
  rejecting: boolean;

  selectRequest: (requestId: string) => Promise<void>;
  clearSelection: () => void;
  toggleExpandFile: (path: string) => void;
  openRejectConfirm: () => void;
  closeRejectConfirm: () => void;
  accept: () => Promise<void>;
  reject: () => Promise<void>;
}

export const useDiffReviewStore = create<DiffReviewState>((set, get) => ({
  activeRequestId: null,
  diff: null,
  loading: false,
  error: null,
  expandedFiles: new Set(),
  confirmRejectOpen: false,
  accepting: false,
  rejecting: false,

  async selectRequest(requestId) {
    set({
      activeRequestId: requestId,
      diff: null,
      loading: true,
      error: null,
      expandedFiles: new Set(),
      confirmRejectOpen: false,
    });
    const result = await window.office.getRequestDiff(requestId);
    if (result.ok) {
      set({ diff: result.diff, loading: false });
    } else {
      set({ error: result.error, loading: false });
    }
  },

  clearSelection() {
    set({
      activeRequestId: null,
      diff: null,
      loading: false,
      error: null,
      expandedFiles: new Set(),
      confirmRejectOpen: false,
      accepting: false,
      rejecting: false,
    });
  },

  toggleExpandFile(path) {
    set((state) => {
      const next = new Set(state.expandedFiles);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return { expandedFiles: next };
    });
  },

  openRejectConfirm() {
    set({ confirmRejectOpen: true });
  },

  closeRejectConfirm() {
    set({ confirmRejectOpen: false });
  },

  async accept() {
    const { activeRequestId, accepting } = get();
    if (!activeRequestId || accepting) return;
    set({ accepting: true, error: null });
    const result = await window.office.acceptRequest(activeRequestId);
    if (result.ok) {
      get().clearSelection();
    } else {
      set({ error: result.error, accepting: false });
    }
  },

  async reject() {
    const { activeRequestId, rejecting } = get();
    if (!activeRequestId || rejecting) return;
    set({ rejecting: true, confirmRejectOpen: false, error: null });
    const result = await window.office.rejectRequest(activeRequestId);
    if (result.ok) {
      get().clearSelection();
    } else {
      set({ error: result.error, rejecting: false });
    }
  },
}));
