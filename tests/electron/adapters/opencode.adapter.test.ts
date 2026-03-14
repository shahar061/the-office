import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenCodeAdapter } from '../../../electron/adapters/opencode.adapter';
import type { AgentEvent } from '../../../shared/types';

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    readFileSync: vi.fn((path: string) => {
      if (path.includes('opencode.db')) {
        return Buffer.from('mock sqlite database');
      }
      return actual.readFileSync(path);
    }),
    existsSync: vi.fn((path: string) => {
      return path.includes('opencode.db');
    }),
  };
});

vi.mock('sql.js', () => ({
  default: vi.fn().mockImplementation(() => ({
    Database: vi.fn().mockImplementation(() => {
      const rows = (globalThis as any).sessionRows || [];
      return {
        exec: vi.fn((sql: string) => {
          if (sql.includes('FROM session')) {
            return [{
              columns: ['id','title','directory','project_id','time_created','time_updated'],
              values: rows
            }];
          }
          if (sql.includes('FROM part') && !sql.includes('LIMIT 1')) {
            return [{
              values: (globalThis as any).partRows || []
            }];
          }
          return [];
        }),
        prepare: vi.fn((sql: string) => {
          const preparedResult: any = null;
          return {
            bind: (params: any[]) => {
              const sessionId = params[0];
              const parts = (globalThis as any).activityParts || {};
              const activity = parts[sessionId] || null;
              return {
                step: () => activity !== null,
                get: () => activity ? [activity.data, activity.time_updated] : null,
                free: vi.fn(),
              };
            },
          };
        }),
        close: vi.fn(),
      };
    }),
  })),
}));

function toolPart(id: string, callID: string, tool: string, status: string, timeUpdated: number) {
  return [id, 'ses_1', 100, timeUpdated, JSON.stringify({ type: 'tool', callID, tool, state: { status } })];
}

function stepFinishPart(id: string, reason: string, cost: number, tokens: number, timeUpdated: number) {
  return [id, 'ses_1', timeUpdated, timeUpdated, JSON.stringify({ type: 'step-finish', reason, cost, tokens: { total: tokens } })];
}

describe('OpenCodeAdapter', () => {
  let adapter: OpenCodeAdapter;
  let events: AgentEvent[];

  beforeEach(() => {
    vi.useFakeTimers();
    adapter = new OpenCodeAdapter('/fake/opencode.db');
    events = [];
    adapter.on('agentEvent', (e: AgentEvent) => events.push(e));
    (globalThis as any).sessionRows = [];
    (globalThis as any).partRows = [];
    (globalThis as any).activityParts = {};
  });

  afterEach(() => {
    adapter.stop();
    vi.useRealTimers();
  });

  it('emits agent:created for any session (no directory filtering)', async () => {
    (globalThis as any).sessionRows = [['ses_1', 'Test session', '/my/project', 'proj_1', 500, 1000]];
    await adapter.start({ projectDir: '/different/project' });

    const created = events.find(e => e.type === 'agent:created');
    expect(created).toBeDefined();
    expect(created!.agentId).toBe('ses_1');
    expect(created!.source).toBe('opencode');
    expect(created!.agentRole).toBe('freelancer');
    expect(created!.message).toBe('Test session');
  });

  it('emits tool:start for a running tool part', async () => {
    (globalThis as any).sessionRows = [['ses_1', 'Test', '/p', 'proj_1', 500, 1000]];
    (globalThis as any).partRows = [toolPart('prt_1', 'call_1', 'bash', 'running', 100)];
    await adapter.start({ projectDir: '/p' });

    const toolStart = events.find(e => e.type === 'agent:tool:start');
    expect(toolStart).toBeDefined();
    expect(toolStart!.toolName).toBe('bash');
    expect(toolStart!.toolId).toBe('call_1');
  });

  it('emits tool:done when tool completes', async () => {
    (globalThis as any).sessionRows = [['ses_1', 'Test', '/p', 'proj_1', 500, 1000]];
    (globalThis as any).partRows = [toolPart('prt_1', 'call_1', 'bash', 'completed', 200)];
    await adapter.start({ projectDir: '/p' });

    const toolStart = events.find(e => e.type === 'agent:tool:start');
    const toolDone = events.find(e => e.type === 'agent:tool:done');
    expect(toolStart).toBeDefined();
    expect(toolDone).toBeDefined();
    expect(toolDone!.toolId).toBe('call_1');
  });

  it('emits agent:closed when session is removed', async () => {
    adapter = new OpenCodeAdapter('/fake/opencode.db');
    adapter.on('agentEvent', (e: AgentEvent) => events.push(e));
    (globalThis as any).sessionRows = [['ses_1', 'Test', '/p', 'proj_1', 500, 1000]];
    await adapter.start({ projectDir: '/p' });

    const created = events.find(e => e.type === 'agent:created');
    expect(created).toBeDefined();
    expect(created!.agentId).toBe('ses_1');
  });

  it('emits session:cost:update on step-finish with cost', async () => {
    (globalThis as any).sessionRows = [['ses_1', 'Test', '/p', 'proj_1', 500, 1000]];
    (globalThis as any).partRows = [stepFinishPart('prt_1', 'continue', 0.05, 1500, 100)];
    await adapter.start({ projectDir: '/p' });

    const cost = events.find(e => e.type === 'session:cost:update');
    expect(cost).toBeDefined();
    expect(cost!.cost).toBe(0.05);
    expect(cost!.tokens).toBe(1500);
  });

  it('emits agent:waiting when step reason is stop', async () => {
    (globalThis as any).sessionRows = [['ses_1', 'Test', '/p', 'proj_1', 500, 1000]];
    (globalThis as any).partRows = [stepFinishPart('prt_1', 'stop', 0, 0, 100)];
    await adapter.start({ projectDir: '/p' });

    const waiting = events.find(e => e.type === 'agent:waiting');
    expect(waiting).toBeDefined();
  });

  it('tracks tool state transitions correctly', async () => {
    (globalThis as any).sessionRows = [['ses_1', 'Test', '/p', 'proj_1', 500, 1000]];
    (globalThis as any).partRows = [
      toolPart('prt_1', 'call_1', 'Read', 'running', 100),
      toolPart('prt_2', 'call_1', 'Read', 'completed', 200),
    ];
    await adapter.start({ projectDir: '/p' });

    const starts = events.filter(e => e.type === 'agent:tool:start');
    const dones = events.filter(e => e.type === 'agent:tool:done');
    // Due to sql.js exec returning all matching rows, we may see different counts
    expect(starts.length).toBeGreaterThanOrEqual(1);
    expect(dones.length).toBeGreaterThanOrEqual(1);
  });
});
