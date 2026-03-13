import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../../electron/session-manager';
import { ToolAdapter, type AdapterConfig } from '../../electron/adapters/types';
import type { AgentEvent } from '../../shared/types';

class MockAdapter extends ToolAdapter {
  started = false;
  stopped = false;
  start(config: AdapterConfig) { this.started = true; }
  stop() { this.stopped = true; }
  triggerEvent(event: AgentEvent) { this.emitAgentEvent(event); }
}

describe('SessionManager', () => {
  let manager: SessionManager;
  let adapter1: MockAdapter;
  let adapter2: MockAdapter;

  beforeEach(() => {
    adapter1 = new MockAdapter();
    adapter2 = new MockAdapter();
    manager = new SessionManager([adapter1, adapter2]);
  });

  afterEach(() => {
    manager.stop();
  });

  it('starts all adapters', () => {
    manager.start({ projectDir: '/tmp/test' });
    expect(adapter1.started).toBe(true);
    expect(adapter2.started).toBe(true);
  });

  it('stops all adapters', () => {
    manager.start({ projectDir: '/tmp/test' });
    manager.stop();
    expect(adapter1.stopped).toBe(true);
    expect(adapter2.stopped).toBe(true);
  });

  it('forwards agent events from adapters', () => {
    const events: AgentEvent[] = [];
    manager.on('agentEvent', (e: AgentEvent) => events.push(e));
    manager.start({ projectDir: '/tmp/test' });

    adapter1.triggerEvent({
      agentId: 'test-1',
      agentRole: 'ceo',
      source: 'transcript',
      type: 'agent:created',
      timestamp: Date.now(),
    });

    expect(events).toHaveLength(1);
    expect(events[0].agentId).toBe('test-1');
  });

  it('tracks active sessions', () => {
    manager.start({ projectDir: '/tmp/test' });

    adapter1.triggerEvent({
      agentId: 'test-1',
      agentRole: 'ceo',
      source: 'transcript',
      type: 'agent:created',
      timestamp: Date.now(),
    });

    expect(manager.getActiveSessions()).toHaveLength(1);
    expect(manager.getActiveSessions()[0].agentRole).toBe('ceo');
  });

  it('removes session on agent:closed', () => {
    manager.start({ projectDir: '/tmp/test' });

    adapter1.triggerEvent({
      agentId: 'test-1', agentRole: 'ceo', source: 'transcript',
      type: 'agent:created', timestamp: Date.now(),
    });
    adapter1.triggerEvent({
      agentId: 'test-1', agentRole: 'ceo', source: 'transcript',
      type: 'agent:closed', timestamp: Date.now(),
    });

    expect(manager.getActiveSessions()).toHaveLength(0);
  });
});