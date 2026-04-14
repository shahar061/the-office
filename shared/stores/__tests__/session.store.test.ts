import { describe, it, expect, beforeEach } from 'vitest';
import { useSessionStore } from '../session.store';
import type { SessionSnapshot, AgentEvent, ChatMessage } from '../../types';

function emptySnapshot(): SessionSnapshot {
  return {
    sessionId: 's', desktopName: 'test', phase: 'idle', startedAt: 1,
    activeAgentId: null, characters: [], chatTail: [], sessionEnded: false,
  };
}

describe('shared session store', () => {
  beforeEach(() => {
    useSessionStore.setState({ snapshot: null, pendingEvents: [] });
  });

  it('setSnapshot replaces snapshot and clears pending events', () => {
    useSessionStore.getState().appendEvent({
      agentId: 'a', agentRole: 'ceo', source: 'sdk', type: 'agent:created', timestamp: 1,
    } as AgentEvent);
    expect(useSessionStore.getState().pendingEvents).toHaveLength(1);
    useSessionStore.getState().setSnapshot(emptySnapshot());
    expect(useSessionStore.getState().snapshot).not.toBeNull();
    expect(useSessionStore.getState().pendingEvents).toHaveLength(0);
  });

  it('hydrateFromCache sets snapshot without clearing events', () => {
    useSessionStore.getState().appendEvent({
      agentId: 'a', agentRole: 'ceo', source: 'sdk', type: 'agent:created', timestamp: 1,
    } as AgentEvent);
    useSessionStore.getState().hydrateFromCache(emptySnapshot());
    expect(useSessionStore.getState().snapshot).not.toBeNull();
    expect(useSessionStore.getState().pendingEvents).toHaveLength(1);
  });

  it('appendEvent queues events', () => {
    const event: AgentEvent = { agentId: 'a', agentRole: 'ceo', source: 'sdk', type: 'agent:created', timestamp: 1 };
    useSessionStore.getState().appendEvent(event);
    expect(useSessionStore.getState().pendingEvents).toEqual([event]);
  });

  it('drainPendingEvents empties queue and returns contents', () => {
    const e1: AgentEvent = { agentId: 'a', agentRole: 'ceo', source: 'sdk', type: 'agent:created', timestamp: 1 };
    const e2: AgentEvent = { agentId: 'b', agentRole: 'product-manager', source: 'sdk', type: 'agent:created', timestamp: 2 };
    useSessionStore.getState().appendEvent(e1);
    useSessionStore.getState().appendEvent(e2);
    const drained = useSessionStore.getState().drainPendingEvents();
    expect(drained).toEqual([e1, e2]);
    expect(useSessionStore.getState().pendingEvents).toEqual([]);
  });

  it('appendChat caps chatTail at 50', () => {
    useSessionStore.getState().setSnapshot(emptySnapshot());
    const many: ChatMessage[] = Array.from({ length: 60 }, (_, i) => ({
      id: `m${i}`, role: 'agent', text: `hi${i}`, timestamp: i,
    }));
    for (const m of many) useSessionStore.getState().appendChat([m]);
    const tail = useSessionStore.getState().snapshot!.chatTail;
    expect(tail).toHaveLength(50);
    expect(tail[0].id).toBe('m10');
    expect(tail[49].id).toBe('m59');
  });

  it('appendChat is a no-op when snapshot is null', () => {
    useSessionStore.getState().appendChat([{ id: 'm1', role: 'agent', text: 'hi', timestamp: 1 }]);
    expect(useSessionStore.getState().snapshot).toBeNull();
  });

  it('applyStatePatch updates phase', () => {
    useSessionStore.getState().setSnapshot(emptySnapshot());
    useSessionStore.getState().applyStatePatch({ kind: 'phase', phase: 'warroom' });
    expect(useSessionStore.getState().snapshot!.phase).toBe('warroom');
  });

  it('applyStatePatch updates activeAgent', () => {
    useSessionStore.getState().setSnapshot(emptySnapshot());
    useSessionStore.getState().applyStatePatch({ kind: 'activeAgent', agentId: 'a1' });
    expect(useSessionStore.getState().snapshot!.activeAgentId).toBe('a1');
  });

  it('applyStatePatch updates sessionEnded', () => {
    useSessionStore.getState().setSnapshot(emptySnapshot());
    useSessionStore.getState().applyStatePatch({ kind: 'ended', ended: true });
    expect(useSessionStore.getState().snapshot!.sessionEnded).toBe(true);
  });

  it('applyStatePatch is a no-op when snapshot is null', () => {
    useSessionStore.getState().applyStatePatch({ kind: 'phase', phase: 'warroom' });
    expect(useSessionStore.getState().snapshot).toBeNull();
  });

  it('clear resets everything', () => {
    useSessionStore.getState().setSnapshot(emptySnapshot());
    useSessionStore.getState().appendEvent({
      agentId: 'a', agentRole: 'ceo', source: 'sdk', type: 'agent:created', timestamp: 1,
    } as AgentEvent);
    useSessionStore.getState().clear();
    expect(useSessionStore.getState().snapshot).toBeNull();
    expect(useSessionStore.getState().pendingEvents).toEqual([]);
  });
});
