// tests/orchestrator/run-agent-session.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runAgentSession } from '../../electron/orchestrator/run-agent-session';

// We use OFFICE_MOCK_AGENTS=1 so runAgentSession routes to a mock that
// just resolves. We replace the mock module via vi.mock to verify the
// signal-listener wiring without running real agents.
vi.mock('../../dev-jump/mock/mock-run-agent-session', () => ({
  mockRunAgentSession: vi.fn(async (config) => {
    return new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        const err: any = new Error('Aborted');
        err.name = 'AbortError';
        reject(err);
      };
      if (config.signal?.aborted) {
        onAbort();
        return;
      }
      config.signal?.addEventListener('abort', onAbort, { once: true });
      setTimeout(resolve, 0);
    });
  }),
}));

describe('runAgentSession signal handling', () => {
  beforeEach(() => { process.env.OFFICE_MOCK_AGENTS = '1'; });
  afterEach(() => { delete process.env.OFFICE_MOCK_AGENTS; });

  it('throws AbortError when signal is already aborted', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(runAgentSession({
      agentName: 'ceo', agentsDir: '/x', prompt: 'p', cwd: '/x', env: {},
      onEvent: () => {}, onWaiting: async () => ({}),
      signal: ctrl.signal,
    } as any)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('aborts mid-call when signal is triggered', async () => {
    const ctrl = new AbortController();
    const promise = runAgentSession({
      agentName: 'ceo', agentsDir: '/x', prompt: 'p', cwd: '/x', env: {},
      onEvent: () => {}, onWaiting: async () => ({}),
      signal: ctrl.signal,
    } as any);
    queueMicrotask(() => ctrl.abort());
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('runs to completion when no signal is provided', async () => {
    await expect(runAgentSession({
      agentName: 'ceo', agentsDir: '/x', prompt: 'p', cwd: '/x', env: {},
      onEvent: () => {}, onWaiting: async () => ({}),
    } as any)).resolves.toBeUndefined();
  });
});
