import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// Mock the ONE electron-safe module phase-advance.ts imports from.
// `state.ts` doesn't pull `ipcMain`, so it loads cleanly in vitest.
vi.mock('../../../electron/ipc/state', () => ({
  handleAgentWaiting: vi.fn(),
}));

import * as state from '../../../electron/ipc/state';
import {
  runAdvanceAfter,
  PHASE_ADVANCE_OPTIONS,
  resolverForRestoredQuestion,
} from '../../../electron/orchestrator/phase-advance';
import type { AskQuestion } from '../../../shared/types';

describe('runAdvanceAfter', () => {
  let dispatch: Mock<[], Promise<void>>;

  beforeEach(() => {
    vi.clearAllMocks();
    dispatch = vi.fn<[], Promise<void>>().mockResolvedValue(undefined);
  });

  it('imagine → synthesizes question with CEO role and "Continue to War Room" option', async () => {
    (state.handleAgentWaiting as any).mockResolvedValue({
      [PHASE_ADVANCE_OPTIONS.imagine.copy.en.question]: PHASE_ADVANCE_OPTIONS.imagine.copy.en.label,
    });
    await runAdvanceAfter('imagine', dispatch);
    expect(state.handleAgentWaiting).toHaveBeenCalledWith('ceo', [
      expect.objectContaining({
        question: PHASE_ADVANCE_OPTIONS.imagine.copy.en.question,
        options: [expect.objectContaining({ label: PHASE_ADVANCE_OPTIONS.imagine.copy.en.label })],
        multiSelect: false,
      }),
    ]);
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it('warroom → synthesizes question with project-manager role', async () => {
    (state.handleAgentWaiting as any).mockResolvedValue({
      [PHASE_ADVANCE_OPTIONS.warroom.copy.en.question]: PHASE_ADVANCE_OPTIONS.warroom.copy.en.label,
    });
    await runAdvanceAfter('warroom', dispatch);
    expect(state.handleAgentWaiting).toHaveBeenCalledWith('project-manager', [
      expect.objectContaining({
        question: PHASE_ADVANCE_OPTIONS.warroom.copy.en.question,
        options: [expect.objectContaining({ label: PHASE_ADVANCE_OPTIONS.warroom.copy.en.label })],
      }),
    ]);
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it('rejected question (project switch) does NOT call dispatch', async () => {
    (state.handleAgentWaiting as any).mockRejectedValue(new Error('Project switch'));
    await runAdvanceAfter('imagine', dispatch);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('resolverForRestoredQuestion', () => {
  const toWarroom = vi.fn();
  const toBuild = vi.fn();
  const fallback = vi.fn();
  const dispatchers = { toWarroom, toBuild, fallback };

  beforeEach(() => {
    toWarroom.mockClear();
    toBuild.mockClear();
    fallback.mockClear();
  });

  function q(text: string): AskQuestion {
    return { question: text, header: 'h', options: [{ label: 'x' }], multiSelect: false };
  }

  it('returns the toWarroom dispatcher when the saved question matches the imagine-advance text', () => {
    const saved = { questions: [q(PHASE_ADVANCE_OPTIONS.imagine.copy.en.question)], phase: 'imagine' as const };
    const resolver = resolverForRestoredQuestion(saved, dispatchers);
    resolver();
    expect(toWarroom).toHaveBeenCalledOnce();
    expect(toBuild).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
  });

  it('returns the toBuild dispatcher when the saved question matches the warroom-advance text', () => {
    const saved = { questions: [q(PHASE_ADVANCE_OPTIONS.warroom.copy.en.question)], phase: 'warroom' as const };
    const resolver = resolverForRestoredQuestion(saved, dispatchers);
    resolver();
    expect(toBuild).toHaveBeenCalledOnce();
    expect(toWarroom).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
  });

  it('falls back with the saved phase when the question is a real agent question', () => {
    const saved = { questions: [q('Which DB should we use?')], phase: 'warroom' as const };
    const resolver = resolverForRestoredQuestion(saved, dispatchers);
    resolver();
    expect(fallback).toHaveBeenCalledWith('warroom');
    expect(toWarroom).not.toHaveBeenCalled();
    expect(toBuild).not.toHaveBeenCalled();
  });

  it('falls back to imagine when no saved phase is present', () => {
    const saved = { questions: [q('Some free-text question?')] };
    const resolver = resolverForRestoredQuestion(saved, dispatchers);
    resolver();
    expect(fallback).toHaveBeenCalledWith('imagine');
  });
});
