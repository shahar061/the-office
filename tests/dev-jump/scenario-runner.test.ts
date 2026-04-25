import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runScenario } from '../../dev-jump/mock/scenario-runner';
import type { Scenario } from '../../dev-jump/mock/types';
import type { AgentSessionConfig } from '../../electron/orchestrator/run-agent-session';

function makeConfig(): AgentSessionConfig {
  return {
    agentName: 'ui-ux-expert',
    agentsDir: '/tmp/agents',
    prompt: '',
    cwd: '/tmp/proj',
    env: {},
    onEvent: vi.fn(),
    onWaiting: vi.fn().mockResolvedValue({}),
  };
}

describe('runScenario', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits created → closed for minimal scenario', async () => {
    const scenario: Scenario = {
      target: 'imagine.ui-ux-expert',
      events: [
        { kind: 'created' },
        { kind: 'closed', delayMs: 0 },
      ],
    };
    const config = makeConfig();

    const promise = runScenario(scenario, config);
    await vi.runAllTimersAsync();
    await promise;

    const events = (config.onEvent as any).mock.calls.map((c: any[]) => c[0].type);
    expect(events).toContain('agent:created');
    expect(events).toContain('agent:closed');
  });

  it('emits tool-start and tool-done as agent:tool:start / agent:tool:done', async () => {
    const scenario: Scenario = {
      target: 'imagine.ui-ux-expert',
      events: [
        { kind: 'created' },
        { kind: 'tool-start', toolName: 'Read', target: '02-prd.md', toolId: 't1' },
        { kind: 'tool-done', toolId: 't1' },
        { kind: 'closed' },
      ],
    };
    const config = makeConfig();

    const promise = runScenario(scenario, config);
    await vi.runAllTimersAsync();
    await promise;

    const events = (config.onEvent as any).mock.calls.map((c: any[]) => c[0]);
    expect(events.some((e: any) => e.type === 'agent:tool:start' && e.toolName === 'Read')).toBe(true);
    expect(events.some((e: any) => e.type === 'agent:tool:done' && e.toolId === 't1')).toBe(true);
  });

  it('calls onWaiting for ask-question events', async () => {
    const scenario: Scenario = {
      target: 'imagine.ceo',
      events: [
        { kind: 'created' },
        {
          kind: 'ask-question',
          questions: [{ question: 'Pick a color', header: 'Color', options: [{ label: 'Blue' }], multiSelect: false }],
        },
        { kind: 'closed' },
      ],
    };
    const config = makeConfig();

    const promise = runScenario(scenario, config);
    await vi.runAllTimersAsync();
    await promise;

    expect(config.onWaiting).toHaveBeenCalledOnce();
  });
});

import fs from 'fs';
import path from 'path';
import os from 'os';

describe('runScenario write-output', () => {
  let projectDir: string;
  let fixturesDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-project-'));
    fixturesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-fixtures-'));
    fs.mkdirSync(path.join(fixturesDir, 'artifacts'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
    fs.rmSync(fixturesDir, { recursive: true, force: true });
  });

  it('copies the target act output fixture to docs/office/', async () => {
    fs.writeFileSync(
      path.join(fixturesDir, 'artifacts/01-vision-brief.md'),
      '# Mock vision',
      'utf-8',
    );

    const scenario: Scenario = {
      target: 'imagine.ceo',
      events: [
        { kind: 'created' },
        { kind: 'write-output' },
        { kind: 'closed' },
      ],
    };
    const config = makeConfig();
    config.cwd = projectDir;

    vi.useRealTimers();
    await runScenario(scenario, config, { fixturesDir });

    const copied = fs.readFileSync(path.join(projectDir, 'docs/office/01-vision-brief.md'), 'utf-8');
    expect(copied).toBe('# Mock vision');
  });

  it('throws if the output fixture is missing', async () => {
    const scenario: Scenario = {
      target: 'imagine.ceo',
      events: [
        { kind: 'created' },
        { kind: 'write-output' },
        { kind: 'closed' },
      ],
    };
    const config = makeConfig();
    config.cwd = projectDir;

    vi.useRealTimers();
    await expect(runScenario(scenario, config, { fixturesDir })).rejects.toThrow(/Missing output fixture/);
  });
});
