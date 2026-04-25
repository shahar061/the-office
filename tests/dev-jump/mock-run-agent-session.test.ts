import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { mockRunAgentSession } from '../../dev-jump/mock/mock-run-agent-session';

describe('mockRunAgentSession', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mrs-'));
    fs.mkdirSync(path.join(projectDir, 'docs/office'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('skeleton fallback emits created/closed when no scenario is registered', async () => {
    const onEvent = vi.fn();
    await mockRunAgentSession({
      agentName: 'ceo',
      agentsDir: '/tmp',
      prompt: '',
      cwd: projectDir,
      env: {},
      onEvent,
      onWaiting: vi.fn().mockResolvedValue({}),
      expectedOutput: '01-vision-brief.md',
    });

    const types = onEvent.mock.calls.map((c) => c[0].type);
    expect(types).toContain('agent:created');
    expect(types).toContain('agent:closed');
    // placeholder output written so downstream act resume works
    expect(fs.existsSync(path.join(projectDir, 'docs/office/01-vision-brief.md'))).toBe(true);
  });
});
