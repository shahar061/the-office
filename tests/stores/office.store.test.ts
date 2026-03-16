import { describe, it, expect, beforeEach } from 'vitest';
import { useOfficeStore } from '../../src/renderer/src/stores/office.store';

describe('OfficeStore activeAgents', () => {
  beforeEach(() => {
    useOfficeStore.setState({ characters: new Map(), activeAgents: new Set() });
  });

  it('adds role to activeAgents on agent:created', () => {
    useOfficeStore.getState().handleAgentEvent({
      agentId: 'a1', agentRole: 'ceo', source: 'sdk',
      type: 'agent:created', timestamp: Date.now(),
    });
    expect(useOfficeStore.getState().activeAgents.has('ceo')).toBe(true);
  });

  it('removes role from activeAgents on agent:closed', () => {
    useOfficeStore.getState().handleAgentEvent({
      agentId: 'a1', agentRole: 'ceo', source: 'sdk',
      type: 'agent:created', timestamp: Date.now(),
    });
    useOfficeStore.getState().handleAgentEvent({
      agentId: 'a1', agentRole: 'ceo', source: 'sdk',
      type: 'agent:closed', timestamp: Date.now(),
    });
    expect(useOfficeStore.getState().activeAgents.has('ceo')).toBe(false);
  });

  it('does not add to activeAgents on tool:start', () => {
    useOfficeStore.getState().handleAgentEvent({
      agentId: 'a1', agentRole: 'ceo', source: 'sdk',
      type: 'agent:tool:start', toolName: 'Read', timestamp: Date.now(),
    });
    expect(useOfficeStore.getState().activeAgents.has('ceo')).toBe(false);
  });

  it('keeps activeAgents unchanged on tool:done', () => {
    useOfficeStore.getState().handleAgentEvent({
      agentId: 'a1', agentRole: 'ceo', source: 'sdk',
      type: 'agent:created', timestamp: Date.now(),
    });
    useOfficeStore.getState().handleAgentEvent({
      agentId: 'a1', agentRole: 'ceo', source: 'sdk',
      type: 'agent:tool:done', timestamp: Date.now(),
    });
    expect(useOfficeStore.getState().activeAgents.has('ceo')).toBe(true);
  });
});
