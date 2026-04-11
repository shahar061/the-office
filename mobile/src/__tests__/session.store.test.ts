import { useSessionStore } from '../state/session.store';
import type { SessionSnapshot, ChatMessage, AgentEvent } from '../types/shared';

function emptySnapshot(): SessionSnapshot {
  return {
    sessionId: 's', desktopName: 'test', phase: 'idle', startedAt: 1,
    activeAgentId: null, characters: [], chatTail: [], sessionEnded: false,
  };
}

describe('mobile session store', () => {
  beforeEach(() => {
    useSessionStore.setState({ snapshot: null, pendingEvents: [] });
  });

  it('setSnapshot replaces snapshot and clears pending events', () => {
    useSessionStore.getState().appendEvent({
      agentId: 'a', agentRole: 'ceo', source: 'sdk', type: 'agent:created', timestamp: 1,
    } as AgentEvent);
    useSessionStore.getState().setSnapshot(emptySnapshot());
    expect(useSessionStore.getState().snapshot).not.toBeNull();
    expect(useSessionStore.getState().pendingEvents).toHaveLength(0);
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
  });

  it('applyStatePatch updates phase', () => {
    useSessionStore.getState().setSnapshot(emptySnapshot());
    useSessionStore.getState().applyStatePatch({ kind: 'phase', phase: 'warroom' });
    expect(useSessionStore.getState().snapshot!.phase).toBe('warroom');
  });
});
