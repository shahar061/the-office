import { describe, it, expect } from 'vitest';
import { classifyActivity, READ_TOOLS } from '../event-reducer';
import type { AgentEvent } from '../../types';

function mkEvent(partial: Partial<AgentEvent>): AgentEvent {
  return {
    agentId: 'a1',
    agentRole: 'ceo',
    source: 'sdk',
    type: 'agent:created',
    timestamp: 1,
    ...partial,
  };
}

describe('classifyActivity', () => {
  it('returns idle for agent:created', () => {
    const result = classifyActivity(mkEvent({ type: 'agent:created' }));
    expect(result).toEqual({ activity: 'idle' });
  });

  it('returns reading for agent:tool:start with Read tool', () => {
    const result = classifyActivity(mkEvent({ type: 'agent:tool:start', toolName: 'Read' }));
    expect(result).toEqual({ activity: 'reading' });
  });

  it('returns reading for all READ_TOOLS', () => {
    for (const tool of READ_TOOLS) {
      const result = classifyActivity(mkEvent({ type: 'agent:tool:start', toolName: tool }));
      expect(result).toEqual({ activity: 'reading' });
    }
  });

  it('returns typing for agent:tool:start with non-read tool', () => {
    const result = classifyActivity(mkEvent({ type: 'agent:tool:start', toolName: 'Write' }));
    expect(result).toEqual({ activity: 'typing' });
  });

  it('returns typing for agent:tool:start with no toolName', () => {
    const result = classifyActivity(mkEvent({ type: 'agent:tool:start' }));
    expect(result).toEqual({ activity: 'typing' });
  });

  it('returns idle for agent:tool:done', () => {
    expect(classifyActivity(mkEvent({ type: 'agent:tool:done' }))).toEqual({ activity: 'idle' });
  });

  it('returns idle for agent:tool:clear', () => {
    expect(classifyActivity(mkEvent({ type: 'agent:tool:clear' }))).toEqual({ activity: 'idle' });
  });

  it('returns waiting for agent:waiting', () => {
    expect(classifyActivity(mkEvent({ type: 'agent:waiting' }))).toEqual({ activity: 'waiting' });
  });

  it('returns removed for agent:closed', () => {
    expect(classifyActivity(mkEvent({ type: 'agent:closed' }))).toEqual({ removed: true });
  });

  it('returns null for non-visual events', () => {
    expect(classifyActivity(mkEvent({ type: 'agent:message' }))).toBeNull();
    expect(classifyActivity(mkEvent({ type: 'agent:message:delta' }))).toBeNull();
    expect(classifyActivity(mkEvent({ type: 'agent:permission' }))).toBeNull();
    expect(classifyActivity(mkEvent({ type: 'session:cost:update' }))).toBeNull();
  });
});

describe('READ_TOOLS', () => {
  it('contains the canonical set of read-like tools', () => {
    expect(READ_TOOLS).toEqual(new Set(['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'Agent']));
  });
});
