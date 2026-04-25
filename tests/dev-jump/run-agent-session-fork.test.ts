import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('runAgentSession fork', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rafork-'));
    fs.mkdirSync(path.join(projectDir, 'docs/office'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
    delete process.env.OFFICE_MOCK_AGENTS;
    vi.resetModules();
  });

  it('calls mockRunAgentSession when OFFICE_MOCK_AGENTS=1', async () => {
    process.env.OFFICE_MOCK_AGENTS = '1';
    const { runAgentSession } = await import('../../electron/orchestrator/run-agent-session');

    const onEvent = vi.fn();
    await runAgentSession({
      agentName: 'ceo',
      agentsDir: '/tmp',
      prompt: 'unused in mock',
      cwd: projectDir,
      env: {},
      onEvent,
      onWaiting: vi.fn().mockResolvedValue({}),
      expectedOutput: '01-vision-brief.md',
    });

    const types = onEvent.mock.calls.map((c) => c[0].type);
    expect(types).toContain('agent:created');
    expect(types).toContain('agent:closed');
  });
});
