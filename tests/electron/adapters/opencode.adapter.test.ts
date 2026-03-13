import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenCodeAdapter } from '../../../electron/adapters/opencode.adapter';
import type { AgentEvent } from '../../../shared/types';

vi.mock('better-sqlite3', () => {
  return {
    default: vi.fn(() => ({
      prepare: vi.fn(() => ({
        all: vi.fn(() => []),
        get: vi.fn(() => null),
      })),
      close: vi.fn(),
    })),
  };
});

describe('OpenCodeAdapter', () => {
  let adapter: OpenCodeAdapter;
  const events: AgentEvent[] = [];

  beforeEach(() => {
    adapter = new OpenCodeAdapter();
    adapter.on('agentEvent', (e: AgentEvent) => events.push(e));
    events.length = 0;
  });

  afterEach(() => {
    adapter.stop();
  });

  it('maps OpenCode session to freelancer role by default', () => {
    adapter.processSessionRow({
      id: 'oc-session-1',
      status: 'active',
      tool_name: 'Read',
      tool_id: 'tool-1',
    });
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].agentRole).toBe('freelancer');
    expect(events[0].source).toBe('opencode');
  });

  it('emits tool:start for active session with tool', () => {
    adapter.processSessionRow({
      id: 'oc-session-1',
      status: 'active',
      tool_name: 'Write',
      tool_id: 'tool-1',
    });
    const toolStart = events.find((e) => e.type === 'agent:tool:start');
    expect(toolStart).toBeDefined();
    expect(toolStart!.toolName).toBe('Write');
  });

  it('emits agent:closed for completed session', () => {
    adapter.processSessionRow({
      id: 'oc-session-1',
      status: 'completed',
    });
    const closed = events.find((e) => e.type === 'agent:closed');
    expect(closed).toBeDefined();
  });
});