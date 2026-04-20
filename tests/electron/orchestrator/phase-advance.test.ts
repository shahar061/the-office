import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// Mock the ONE electron-safe module phase-advance.ts imports from.
// `state.ts` doesn't pull `ipcMain`, so it loads cleanly in vitest.
vi.mock('../../../electron/ipc/state', () => ({
  handleAgentWaiting: vi.fn(),
}));

import * as state from '../../../electron/ipc/state';
import { runAdvanceAfter, PHASE_ADVANCE_OPTIONS } from '../../../electron/orchestrator/phase-advance';

describe('runAdvanceAfter', () => {
  let dispatch: Mock<[], Promise<void>>;

  beforeEach(() => {
    vi.clearAllMocks();
    dispatch = vi.fn<[], Promise<void>>().mockResolvedValue(undefined);
  });

  it('imagine → synthesizes question with CEO role and "Continue to War Room" option', async () => {
    (state.handleAgentWaiting as any).mockResolvedValue({
      [PHASE_ADVANCE_OPTIONS.imagine.question]: PHASE_ADVANCE_OPTIONS.imagine.label,
    });
    await runAdvanceAfter('imagine', dispatch);
    expect(state.handleAgentWaiting).toHaveBeenCalledWith('ceo', [
      expect.objectContaining({
        question: PHASE_ADVANCE_OPTIONS.imagine.question,
        options: [expect.objectContaining({ label: PHASE_ADVANCE_OPTIONS.imagine.label })],
        multiSelect: false,
      }),
    ]);
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it('warroom → synthesizes question with project-manager role', async () => {
    (state.handleAgentWaiting as any).mockResolvedValue({
      [PHASE_ADVANCE_OPTIONS.warroom.question]: PHASE_ADVANCE_OPTIONS.warroom.label,
    });
    await runAdvanceAfter('warroom', dispatch);
    expect(state.handleAgentWaiting).toHaveBeenCalledWith('project-manager', [
      expect.objectContaining({
        question: PHASE_ADVANCE_OPTIONS.warroom.question,
        options: [expect.objectContaining({ label: PHASE_ADVANCE_OPTIONS.warroom.label })],
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
