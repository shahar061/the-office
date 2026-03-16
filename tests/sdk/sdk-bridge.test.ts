import { describe, it, expect } from 'vitest';
import { translateMessage, resolveRole } from '../../electron/sdk/sdk-bridge';
import type { AgentRole } from '../../shared/types';

const DEFAULT_ROLE: AgentRole = 'ceo';

describe('translateMessage', () => {
  it('system init → agent:created with session_id', () => {
    const msg = {
      type: 'system',
      subtype: 'init',
      session_id: 'sess-abc123',
    };
    const events = translateMessage(msg, DEFAULT_ROLE);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('agent:created');
    expect(events[0].message).toBe('sess-abc123');
    expect(events[0].agentRole).toBe(DEFAULT_ROLE);
    expect(events[0].source).toBe('sdk');
  });

  it('assistant with tool_use → agent:tool:start with name and id', () => {
    const msg = {
      type: 'assistant',
      content: [
        {
          type: 'tool_use',
          name: 'Bash',
          id: 'tool-xyz',
        },
      ],
    };
    const events = translateMessage(msg, DEFAULT_ROLE);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('agent:tool:start');
    expect(events[0].toolName).toBe('Bash');
    expect(events[0].toolId).toBe('tool-xyz');
  });

  it('assistant with text → agent:message', () => {
    const msg = {
      type: 'assistant',
      content: [
        {
          type: 'text',
          text: 'Hello from the agent',
        },
      ],
    };
    const events = translateMessage(msg, DEFAULT_ROLE);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('agent:message');
    expect(events[0].message).toBe('Hello from the agent');
  });

  it('user with tool_use_result → agent:tool:done', () => {
    const msg = {
      type: 'user',
      tool_use_result: true,
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'tool-xyz',
        },
      ],
    };
    const events = translateMessage(msg, DEFAULT_ROLE);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('agent:tool:done');
    expect(events[0].toolId).toBe('tool-xyz');
  });

  it('result → session:cost:update with cost and summed tokens', () => {
    const msg = {
      type: 'result',
      total_cost_usd: 0.042,
      usage: {
        input_tokens: 1500,
        output_tokens: 300,
      },
    };
    const events = translateMessage(msg, DEFAULT_ROLE);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('session:cost:update');
    expect(events[0].cost).toBe(0.042);
    expect(events[0].tokens).toBe(1800);
  });

  it('stream_event content_block_delta text_delta → agent:message:delta', () => {
    const msg = {
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        delta: {
          type: 'text_delta',
          text: 'streaming chunk',
        },
      },
    };
    const events = translateMessage(msg, DEFAULT_ROLE);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('agent:message:delta');
    expect(events[0].message).toBe('streaming chunk');
  });

  it('system task_started → agent:created for subagent (map name to role)', () => {
    const msg = {
      type: 'system',
      subtype: 'task_started',
      task_name: 'backend-engineer',
    };
    const events = translateMessage(msg, DEFAULT_ROLE);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('agent:created');
    expect(events[0].agentRole).toBe('backend-engineer');
    expect(events[0].message).toBe('backend-engineer');
  });

  it('system task_notification → agent:closed for subagent', () => {
    const msg = {
      type: 'system',
      subtype: 'task_notification',
      task_name: 'frontend-engineer',
    };
    const events = translateMessage(msg, DEFAULT_ROLE);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('agent:closed');
    expect(events[0].agentRole).toBe('frontend-engineer');
  });

  it('unknown type → empty array', () => {
    const msg = { type: 'some_unknown_event', data: 'whatever' };
    const events = translateMessage(msg, DEFAULT_ROLE);
    expect(events).toHaveLength(0);
  });
});

describe('resolveRole', () => {
  it('maps known roles directly', () => {
    expect(resolveRole('ceo')).toBe('ceo');
    expect(resolveRole('backend-engineer')).toBe('backend-engineer');
    expect(resolveRole('devops')).toBe('devops');
  });

  it('normalizes spaces and underscores to hyphens', () => {
    expect(resolveRole('backend engineer')).toBe('backend-engineer');
    expect(resolveRole('backend_engineer')).toBe('backend-engineer');
  });

  it('normalizes to lowercase', () => {
    expect(resolveRole('CEO')).toBe('ceo');
    expect(resolveRole('Backend-Engineer')).toBe('backend-engineer');
  });

  it('falls back to freelancer for unknown names', () => {
    expect(resolveRole('unknown-role')).toBe('freelancer');
    expect(resolveRole('wizard')).toBe('freelancer');
  });
});
