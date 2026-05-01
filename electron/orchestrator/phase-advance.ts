// electron/orchestrator/phase-advance.ts
//
// When a phase (imagine or warroom) completes, synthesize an
// AskUserQuestion that serves as the user's "advance to next phase"
// trigger. Desktop renders the same QuestionBubble it shows for real
// questions (PhaseActionButton is retired in sub-project 3a). Mobile
// sees it via sub-project 2's waiting signal and renders an interactive
// QuestionBubble. Tapping the option on either surface resolves the
// pending question; this module's `runAdvanceAfter` awaits that
// resolution and calls the injected `dispatchNext` callback, which the
// caller wires to the next phase handler.
//
// This module intentionally has zero electron side-effects (no
// `ipcMain.handle`) so it can be unit-tested without booting electron.
// The dependency on the next-phase handler is injected via
// `dispatchNext` — avoids a circular import with `phase-handlers.ts`.

import type { AgentRole, AskQuestion, Phase } from '../../shared/types';
import { handleAgentWaiting } from '../ipc/state';
import { currentLanguageFromEnv, type Language } from './language';

interface PhaseAdvanceCopy {
  question: string;
  header: string;
  label: string;
}

interface PhaseAdvanceSpec {
  role: AgentRole;
  copy: Record<Language, PhaseAdvanceCopy>;
}

export const PHASE_ADVANCE_OPTIONS: Record<'imagine' | 'warroom', PhaseAdvanceSpec> = {
  imagine: {
    role: 'ceo',
    copy: {
      en: {
        question: 'Imagine phase complete. Ready to move to the War Room?',
        header: 'Continue',
        label: 'Continue to War Room',
      },
      he: {
        question: 'שלב ה-Imagine הושלם. ממשיכים לחדר המלחמה?',
        header: 'המשך',
        label: 'המשך לחדר המלחמה',
      },
    },
  },
  warroom: {
    role: 'project-manager',
    copy: {
      en: {
        question: 'Plan is locked. Ready to build it?',
        header: 'Continue',
        label: 'Start Build',
      },
      he: {
        question: 'התוכנית ננעלה. מתחילים בבנייה?',
        header: 'המשך',
        label: 'התחל בנייה',
      },
    },
  },
} as const;

export type PhaseAdvanceFrom = keyof typeof PHASE_ADVANCE_OPTIONS;

/** Returns true if the saved question text matches a known phase-advance
 *  prompt for the given source phase, in any supported language. Used by
 *  resolverForRestoredQuestion so a Hebrew-localised question still routes
 *  to the correct dispatcher after an app restart. */
function isPhaseAdvanceQuestion(from: PhaseAdvanceFrom, text: string): boolean {
  const langs: Language[] = ['en', 'he'];
  return langs.some(l => PHASE_ADVANCE_OPTIONS[from].copy[l].question === text);
}

export async function runAdvanceAfter(
  from: PhaseAdvanceFrom,
  dispatchNext: () => Promise<void>,
): Promise<void> {
  const spec = PHASE_ADVANCE_OPTIONS[from];
  const copy = spec.copy[currentLanguageFromEnv()];
  try {
    await handleAgentWaiting(spec.role, [{
      question: copy.question,
      header: copy.header,
      options: [{ label: copy.label }],
      multiSelect: false,
    }]);
  } catch (err) {
    console.warn(`[phase-advance] ${from} synthesis rejected:`, err);
    return;
  }
  try {
    await dispatchNext();
  } catch (err) {
    console.warn(`[phase-advance] ${from} dispatchNext failed:`, err);
  }
}

/**
 * On app restart, the persisted pending question is re-hydrated but the
 * original in-process awaiter is gone. This factory returns the right
 * resolver for the restored question: if the text matches a phase-advance
 * signature, answering dispatches to the next phase handler via the
 * injected `toWarroom` / `toBuild` callbacks. Otherwise it falls back to
 * `fallback(savedPhase)` — the caller wires that to `resumePhase`, which
 * re-runs the phase with conversation context for real agent questions.
 *
 * Dispatchers are injected rather than imported so this module stays
 * electron-free and the `resolverForRestoredQuestion` branches can be
 * unit-tested without booting phase-handlers.ts.
 */
export interface RestoredQuestionDispatchers {
  toWarroom: () => void;
  toBuild: () => void;
  fallback: (savedPhase: Phase) => void;
}

export function resolverForRestoredQuestion(
  saved: { questions: AskQuestion[]; phase?: Phase },
  dispatchers: RestoredQuestionDispatchers,
): () => void {
  const q = saved.questions[0];
  if (q) {
    if (isPhaseAdvanceQuestion('imagine', q.question)) return dispatchers.toWarroom;
    if (isPhaseAdvanceQuestion('warroom', q.question)) return dispatchers.toBuild;
  }
  const savedPhase = saved.phase ?? 'imagine';
  return () => dispatchers.fallback(savedPhase as Phase);
}
