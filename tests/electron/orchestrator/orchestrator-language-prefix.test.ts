import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock ArtifactStore so hasArtifact always returns false (first act always runs).
vi.mock('../../../electron/project/artifact-store', () => ({
  ArtifactStore: vi.fn().mockImplementation(() => ({
    hasArtifact: vi.fn().mockReturnValue(false),
    readArtifact: vi.fn().mockReturnValue(''),
    listUIDesigns: vi.fn().mockReturnValue({ designDirection: '', mockups: [] }),
    getImagineContext: vi.fn().mockReturnValue(''),
  })),
}));

// Mock runAgentSession at module level so vi.spyOn can intercept it.
vi.mock('../../../electron/orchestrator/run-agent-session', () => ({
  runAgentSession: vi.fn().mockResolvedValue(undefined),
}));

import * as runAgentSessionMod from '../../../electron/orchestrator/run-agent-session';

describe('orchestrator language prefix', () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.OFFICE_LANGUAGE;
  });

  it('prepends Hebrew addendum to imagine CEO prompt when OFFICE_LANGUAGE=he', async () => {
    process.env.OFFICE_LANGUAGE = 'he';

    // Re-import imagine fresh so it picks up the updated env var.
    vi.resetModules();
    // Re-apply mocks after resetModules clears the registry.
    vi.mock('../../../electron/project/artifact-store', () => ({
      ArtifactStore: vi.fn().mockImplementation(() => ({
        hasArtifact: vi.fn().mockReturnValue(false),
        readArtifact: vi.fn().mockReturnValue(''),
        listUIDesigns: vi.fn().mockReturnValue({ designDirection: '', mockups: [] }),
        getImagineContext: vi.fn().mockReturnValue(''),
      })),
    }));
    vi.mock('../../../electron/orchestrator/run-agent-session', () => ({
      runAgentSession: vi.fn().mockResolvedValue(undefined),
    }));

    const { runImagine } = await import('../../../electron/orchestrator/imagine');
    const { runAgentSession } = await import('../../../electron/orchestrator/run-agent-session');

    const minimalConfig: any = {
      projectDir: '/tmp/test-imagine',
      agentsDir: '/tmp/agents',
      env: {},
      onEvent: vi.fn(),
      onWaiting: vi.fn().mockResolvedValue({}),
      onSystemMessage: vi.fn(),
      onArtifactAvailable: vi.fn(),
      onUIReviewReady: vi.fn().mockResolvedValue({ approved: true }),
    };

    try {
      await runImagine('test idea', minimalConfig);
    } catch {
      // Don't care about completion — only need the first call.
    }

    expect(runAgentSession).toHaveBeenCalled();
    const calls = (runAgentSession as ReturnType<typeof vi.fn>).mock.calls;
    const firstCall = calls[0]?.[0];
    expect(firstCall?.prompt).toContain('Hebrew');
    expect(firstCall?.prompt).toContain('AskUserQuestion');
  });

  it('does not prepend addendum when OFFICE_LANGUAGE=en', async () => {
    process.env.OFFICE_LANGUAGE = 'en';

    vi.resetModules();
    vi.mock('../../../electron/project/artifact-store', () => ({
      ArtifactStore: vi.fn().mockImplementation(() => ({
        hasArtifact: vi.fn().mockReturnValue(false),
        readArtifact: vi.fn().mockReturnValue(''),
        listUIDesigns: vi.fn().mockReturnValue({ designDirection: '', mockups: [] }),
        getImagineContext: vi.fn().mockReturnValue(''),
      })),
    }));
    vi.mock('../../../electron/orchestrator/run-agent-session', () => ({
      runAgentSession: vi.fn().mockResolvedValue(undefined),
    }));

    const { runImagine } = await import('../../../electron/orchestrator/imagine');
    const { runAgentSession } = await import('../../../electron/orchestrator/run-agent-session');

    const minimalConfig: any = {
      projectDir: '/tmp/test-imagine-en',
      agentsDir: '/tmp/agents',
      env: {},
      onEvent: vi.fn(),
      onWaiting: vi.fn().mockResolvedValue({}),
      onSystemMessage: vi.fn(),
      onArtifactAvailable: vi.fn(),
      onUIReviewReady: vi.fn().mockResolvedValue({ approved: true }),
    };

    try {
      await runImagine('test idea', minimalConfig);
    } catch {
      // ignore
    }

    const calls = (runAgentSession as ReturnType<typeof vi.fn>).mock.calls;
    const firstCall = calls[0]?.[0];
    expect(firstCall?.prompt).not.toContain('Hebrew');
    expect(firstCall?.prompt).not.toContain('## Language');
  });
});
