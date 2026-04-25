import { create } from 'zustand';
import type { ReportType } from '@shared/types';

interface BugReportStore {
  isOpen: boolean;
  type: ReportType;
  title: string;
  body: string;
  turnstileToken: string | null;
  submitting: boolean;
  result: { ok: true; id: number } | { ok: false; message: string } | null;

  open: () => void;
  close: () => void;
  setType: (t: ReportType) => void;
  setTitle: (s: string) => void;
  setBody: (s: string) => void;
  setTurnstileToken: (t: string | null) => void;
  submit: () => Promise<void>;
  reset: () => void;
}

const initial = {
  isOpen: false,
  type: 'bug' as ReportType,
  title: '',
  body: '',
  turnstileToken: null,
  submitting: false,
  result: null,
};

export const useBugReportStore = create<BugReportStore>((set, get) => ({
  ...initial,

  open: () => set({ ...initial, isOpen: true }),
  close: () => set({ isOpen: false }),
  setType: (type) => set({ type }),
  setTitle: (title) => set({ title }),
  setBody: (body) => set({ body }),
  setTurnstileToken: (turnstileToken) => set({ turnstileToken }),

  submit: async () => {
    const s = get();
    if (s.submitting) return;
    if (!s.turnstileToken) return;

    set({ submitting: true, result: null });
    const result = await window.office.feedback.submitReport({
      type: s.type,
      title: s.title.trim(),
      body: s.body.trim(),
      turnstileToken: s.turnstileToken,
    });

    if (result.ok) {
      set({ submitting: false, result: { ok: true, id: result.id } });
      // Auto-close after 2s on success
      setTimeout(() => {
        if (get().result?.ok) get().close();
      }, 2000);
    } else {
      set({ submitting: false, result: { ok: false, message: result.message } });
    }
  },

  reset: () => set({ ...initial, isOpen: get().isOpen }),
}));
