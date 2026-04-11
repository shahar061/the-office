import { describe, it, expect, beforeEach } from 'vitest';
import { useMobileSessionStore } from '../session.store';
import type { SessionSnapshot, AgentEvent, ChatMessage } from '../../../shared/types';

function emptySnapshot(): SessionSnapshot {
  return {
    sessionId: 's',
    desktopName: 'test',
    phase: 'idle',
    startedAt: 1,
    activeAgentId: null,
    characters: [],
    chatTail: [],
    sessionEnded: false,
  };
}

describe('mobile session store', () => {
  beforeEach(() => {
    useMobileSessionStore.setState({
      snapshot: null,
      pendingEvents: [],
    });
  });

  it('setSnapshot replaces the snapshot and clears pendingEvents', () => {
    const event: AgentEvent = {
      agentId: 'a', agentRole: 'ceo', source: 'sdk', type: 'agent:created', timestamp: 1,
    };
    useMobileSessionStore.getState().appendEvent(event);
    expect(useMobileSessionStore.getState().pendingEvents).toHaveLength(1);

    useMobileSessionStore.getState().setSnapshot(emptySnapshot());
    expect(useMobileSessionStore.getState().snapshot).not.toBeNull();
    expect(useMobileSessionStore.getState().pendingEvents).toHaveLength(0);
  });

  it('appendEvent queues events', () => {
    const event: AgentEvent = { agentId: 'a', agentRole: 'ceo', source: 'sdk', type: 'agent:created', timestamp: 1 };
    useMobileSessionStore.getState().appendEvent(event);
    expect(useMobileSessionStore.getState().pendingEvents).toEqual([event]);
  });

  it('drainPendingEvents empties the queue and returns prior contents', () => {
    const e1: AgentEvent = { agentId: 'a', agentRole: 'ceo', source: 'sdk', type: 'agent:created', timestamp: 1 };
    const e2: AgentEvent = { agentId: 'b', agentRole: 'product-manager', source: 'sdk', type: 'agent:created', timestamp: 2 };
    const store = useMobileSessionStore.getState();
    store.appendEvent(e1);
    store.appendEvent(e2);
    const drained = useMobileSessionStore.getState().drainPendingEvents();
    expect(drained).toEqual([e1, e2]);
    expect(useMobileSessionStore.getState().pendingEvents).toEqual([]);
  });

  it('appendChat appends to snapshot chatTail with 50-message cap', () => {
    useMobileSessionStore.getState().setSnapshot(emptySnapshot());
    const messages: ChatMessage[] = Array.from({ length: 60 }, (_, i) => ({
      id: `m${i}`, role: 'agent', text: `hi${i}`, timestamp: i,
    }));
    for (const m of messages) useMobileSessionStore.getState().appendChat([m]);
    const tail = useMobileSessionStore.getState().snapshot!.chatTail;
    expect(tail).toHaveLength(50);
    expect(tail[0].id).toBe('m10');
    expect(tail[49].id).toBe('m59');
  });

  it('appendChat is a no-op when snapshot is null', () => {
    const msg: ChatMessage = { id: 'm1', role: 'agent', text: 'hi', timestamp: 1 };
    useMobileSessionStore.getState().appendChat([msg]);
    expect(useMobileSessionStore.getState().snapshot).toBeNull();
  });

  it('applyStatePatch updates phase/activeAgent/sessionEnded in the snapshot', () => {
    useMobileSessionStore.getState().setSnapshot(emptySnapshot());
    useMobileSessionStore.getState().applyStatePatch({ kind: 'phase', phase: 'warroom' });
    expect(useMobileSessionStore.getState().snapshot!.phase).toBe('warroom');

    useMobileSessionStore.getState().applyStatePatch({ kind: 'activeAgent', agentId: 'a1' });
    expect(useMobileSessionStore.getState().snapshot!.activeAgentId).toBe('a1');

    useMobileSessionStore.getState().applyStatePatch({ kind: 'ended', ended: true });
    expect(useMobileSessionStore.getState().snapshot!.sessionEnded).toBe(true);
  });

  it('applyStatePatch is a no-op when snapshot is null', () => {
    useMobileSessionStore.getState().applyStatePatch({ kind: 'phase', phase: 'warroom' });
    expect(useMobileSessionStore.getState().snapshot).toBeNull();
  });
});
