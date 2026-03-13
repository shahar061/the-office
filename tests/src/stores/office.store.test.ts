import { describe, it, expect, beforeEach } from 'vitest';
import { useOfficeStore } from '../../../src/renderer/src/stores/office.store';
import type { AgentEvent } from '../../../shared/types';

function makeEvent(overrides: Partial<AgentEvent> = {}): AgentEvent {
  return {
    agentId: 'agent-1',
    agentRole: 'backend-engineer',
    source: 'transcript',
    type: 'agent:created',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('OfficeStore', () => {
  beforeEach(() => {
    useOfficeStore.getState().reset();
  });

  it('starts with empty agents map', () => {
    expect(useOfficeStore.getState().agents).toEqual({});
  });

  it('adds agent on agent:created event', () => {
    useOfficeStore.getState().handleAgentEvent(makeEvent({ type: 'agent:created' }));
    const agents = useOfficeStore.getState().agents;
    expect(agents['agent-1']).toBeDefined();
    expect(agents['agent-1'].role).toBe('backend-engineer');
    expect(agents['agent-1'].state).toBe('idle');
  });

  it('sets agent to typing on tool:start with Write tool', () => {
    useOfficeStore.getState().handleAgentEvent(makeEvent({ type: 'agent:created' }));
    useOfficeStore.getState().handleAgentEvent(makeEvent({ type: 'agent:tool:start', toolName: 'Write' }));
    expect(useOfficeStore.getState().agents['agent-1'].state).toBe('type');
    expect(useOfficeStore.getState().agents['agent-1'].currentTool).toBe('Write');
  });

  it('sets agent to reading on tool:start with Read tool', () => {
    useOfficeStore.getState().handleAgentEvent(makeEvent({ type: 'agent:created' }));
    useOfficeStore.getState().handleAgentEvent(makeEvent({ type: 'agent:tool:start', toolName: 'Read' }));
    expect(useOfficeStore.getState().agents['agent-1'].state).toBe('read');
  });

  it('returns agent to idle on tool:done', () => {
    useOfficeStore.getState().handleAgentEvent(makeEvent({ type: 'agent:created' }));
    useOfficeStore.getState().handleAgentEvent(makeEvent({ type: 'agent:tool:start', toolName: 'Write' }));
    useOfficeStore.getState().handleAgentEvent(makeEvent({ type: 'agent:tool:done' }));
    expect(useOfficeStore.getState().agents['agent-1'].state).toBe('idle');
  });

  it('removes agent on agent:closed', () => {
    useOfficeStore.getState().handleAgentEvent(makeEvent({ type: 'agent:created' }));
    useOfficeStore.getState().handleAgentEvent(makeEvent({ type: 'agent:closed' }));
    expect(useOfficeStore.getState().agents['agent-1']).toBeUndefined();
  });

  it('sets waiting state on agent:waiting', () => {
    useOfficeStore.getState().handleAgentEvent(makeEvent({ type: 'agent:created' }));
    useOfficeStore.getState().handleAgentEvent(makeEvent({ type: 'agent:waiting' }));
    expect(useOfficeStore.getState().agents['agent-1'].state).toBe('idle');
    expect(useOfficeStore.getState().agents['agent-1'].waiting).toBe(true);
  });

  it('sets permission flag on agent:permission', () => {
    useOfficeStore.getState().handleAgentEvent(makeEvent({ type: 'agent:created' }));
    useOfficeStore.getState().handleAgentEvent(makeEvent({ type: 'agent:permission', toolName: 'Bash', toolId: 'tool-1' }));
    expect(useOfficeStore.getState().agents['agent-1'].needsPermission).toBe(true);
    expect(useOfficeStore.getState().agents['agent-1'].permissionToolId).toBe('tool-1');
  });
});