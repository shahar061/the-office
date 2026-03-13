import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenCodeAdapter } from '../../../electron/adapters/opencode.adapter';
import type { AgentEvent } from '../../../shared/types';

let sessionRows: unknown[] = [];
let partRows: unknown[] = [];
let shouldThrow = false;

vi.mock('better-sqlite3', () => {
  return {
    default: vi.fn(() => ({
      prepare: (sql: string) => ({
        all: (..._args: unknown[]) => {
          if (shouldThrow) throw new Error('SQLITE_BUSY');
          if (sql.includes('FROM session')) return sessionRows;
          if (sql.includes('FROM part')) return partRows;
          return [];
        },
      }),
      close: vi.fn(),
    })),
  };
});

function toolPart(id: string, callID: string, tool: string, status: string, timeUpdated: number) {
  return {
    id, session_id: 'ses_1', time_created: 100, time_updated: timeUpdated,
    data: JSON.stringify({ type: 'tool', callID, tool, state: { status } }),
  };
}

function stepFinishPart(id: string, reason: string, cost: number, tokens: number, timeUpdated: number) {
  return {
    id, session_id: 'ses_1', time_created: timeUpdated, time_updated: timeUpdated,
    data: JSON.stringify({ type: 'step-finish', reason, cost, tokens: { total: tokens } }),
  };
}

describe('OpenCodeAdapter', () => {
  let adapter: OpenCodeAdapter;
  let events: AgentEvent[];

  beforeEach(() => {
    vi.useFakeTimers();
    adapter = new OpenCodeAdapter('/fake/opencode.db');
    events = [];
    adapter.on('agentEvent', (e: AgentEvent) => events.push(e));
    sessionRows = [];
    partRows = [];
    shouldThrow = false;
  });

  afterEach(() => {
    adapter.stop();
    vi.useRealTimers();
  });

  it('emits agent:created when a session for the project is found', () => {
    sessionRows = [{ id: 'ses_1', title: 'Test session', directory: '/my/project', time_updated: 1000 }];
    adapter.start({ projectDir: '/my/project' });

    const created = events.find(e => e.type === 'agent:created');
    expect(created).toBeDefined();
    expect(created!.agentId).toBe('ses_1');
    expect(created!.source).toBe('opencode');
    expect(created!.agentRole).toBe('freelancer');
    expect(created!.message).toBe('Test session');
  });

  it('emits no events when no sessions match the project directory', () => {
    sessionRows = [];
    adapter.start({ projectDir: '/my/project' });
    expect(events).toHaveLength(0);
  });

  it('emits tool:start for a running tool part', () => {
    sessionRows = [{ id: 'ses_1', title: 'Test', directory: '/p', time_updated: 1000 }];
    partRows = [toolPart('prt_1', 'call_1', 'bash', 'running', 100)];
    adapter.start({ projectDir: '/p' });

    const toolStart = events.find(e => e.type === 'agent:tool:start');
    expect(toolStart).toBeDefined();
    expect(toolStart!.toolName).toBe('bash');
    expect(toolStart!.toolId).toBe('call_1');
  });

  it('emits tool:done when a running tool transitions to completed', () => {
    sessionRows = [{ id: 'ses_1', title: 'Test', directory: '/p', time_updated: 1000 }];
    partRows = [toolPart('prt_1', 'call_1', 'read', 'running', 100)];
    adapter.start({ projectDir: '/p' });

    // Tool completes on next poll (time_updated increases)
    partRows = [toolPart('prt_1', 'call_1', 'read', 'completed', 200)];
    vi.advanceTimersByTime(1000);

    const toolDone = events.find(e => e.type === 'agent:tool:done');
    expect(toolDone).toBeDefined();
    expect(toolDone!.toolName).toBe('read');
    expect(toolDone!.toolId).toBe('call_1');
  });

  it('emits both start and done when the running state was missed', () => {
    sessionRows = [{ id: 'ses_1', title: 'Test', directory: '/p', time_updated: 1000 }];
    partRows = [toolPart('prt_1', 'call_1', 'write', 'completed', 200)];
    adapter.start({ projectDir: '/p' });

    const starts = events.filter(e => e.type === 'agent:tool:start');
    const dones = events.filter(e => e.type === 'agent:tool:done');
    expect(starts).toHaveLength(1);
    expect(dones).toHaveLength(1);
    expect(starts[0].toolName).toBe('write');
    expect(dones[0].toolName).toBe('write');
  });

  it('emits agent:waiting on step-finish with reason stop', () => {
    sessionRows = [{ id: 'ses_1', title: 'Test', directory: '/p', time_updated: 1000 }];
    partRows = [stepFinishPart('prt_1', 'stop', 0.015, 5000, 100)];
    adapter.start({ projectDir: '/p' });

    const waiting = events.find(e => e.type === 'agent:waiting');
    expect(waiting).toBeDefined();
    expect(waiting!.agentId).toBe('ses_1');
  });

  it('emits cost update from step-finish', () => {
    sessionRows = [{ id: 'ses_1', title: 'Test', directory: '/p', time_updated: 1000 }];
    partRows = [stepFinishPart('prt_1', 'tool-calls', 0.025, 8000, 100)];
    adapter.start({ projectDir: '/p' });

    const costUpdate = events.find(e => e.type === 'session:cost:update');
    expect(costUpdate).toBeDefined();
    expect(costUpdate!.cost).toBe(0.025);
    expect(costUpdate!.tokens).toBe(8000);
  });

  it('emits agent:closed when a session disappears', () => {
    sessionRows = [{ id: 'ses_1', title: 'Test', directory: '/p', time_updated: 1000 }];
    adapter.start({ projectDir: '/p' });

    events.length = 0;
    sessionRows = [];
    partRows = [];
    vi.advanceTimersByTime(1000);

    const closed = events.find(e => e.type === 'agent:closed');
    expect(closed).toBeDefined();
    expect(closed!.agentId).toBe('ses_1');
  });

  it('does not emit duplicate events for unchanged tool state', () => {
    sessionRows = [{ id: 'ses_1', title: 'Test', directory: '/p', time_updated: 1000 }];
    partRows = [toolPart('prt_1', 'call_1', 'bash', 'running', 100)];
    adapter.start({ projectDir: '/p' });

    const startCount = events.filter(e => e.type === 'agent:tool:start').length;

    // Same tool re-appears with slightly higher time_updated but same status
    partRows = [toolPart('prt_1', 'call_1', 'bash', 'running', 101)];
    vi.advanceTimersByTime(1000);

    expect(events.filter(e => e.type === 'agent:tool:start').length).toBe(startCount);
  });

  it('does not emit agent:waiting for step-finish with reason tool-calls', () => {
    sessionRows = [{ id: 'ses_1', title: 'Test', directory: '/p', time_updated: 1000 }];
    partRows = [stepFinishPart('prt_1', 'tool-calls', 0.01, 3000, 100)];
    adapter.start({ projectDir: '/p' });

    const waiting = events.find(e => e.type === 'agent:waiting');
    expect(waiting).toBeUndefined();
  });

  it('stops polling after max consecutive failures', () => {
    sessionRows = [{ id: 'ses_1', title: 'Test', directory: '/p', time_updated: 1000 }];
    adapter.start({ projectDir: '/p' });

    events.length = 0;
    shouldThrow = true;

    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(1000);
    }

    const closed = events.find(e => e.type === 'agent:closed' && e.agentId === 'opencode-bridge');
    expect(closed).toBeDefined();
    expect(closed!.message).toContain('repeated failures');
  });

  it('skips malformed JSON in part data gracefully', () => {
    sessionRows = [{ id: 'ses_1', title: 'Test', directory: '/p', time_updated: 1000 }];
    partRows = [{
      id: 'prt_bad', session_id: 'ses_1', time_created: 100, time_updated: 100,
      data: 'not valid json{{{',
    }];
    adapter.start({ projectDir: '/p' });

    // Should only have agent:created, no crash
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('agent:created');
  });
});
