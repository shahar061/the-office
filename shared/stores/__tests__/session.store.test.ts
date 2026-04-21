import { describe, it, expect, beforeEach } from 'vitest';
import { useSessionStore } from '../session.store';
import type { CharacterState, SessionSnapshot } from '../../types';

const sample = (agentId: string, x: number, y: number): CharacterState => ({
  agentId, x, y,
  direction: 'down',
  animation: 'idle',
  visible: true,
  alpha: 1,
  toolBubble: null,
});

describe('useSessionStore characterStates slice', () => {
  beforeEach(() => {
    useSessionStore.setState({ characterStates: new Map(), lastCharStateTs: 0 });
  });

  it('applyCharState replaces the Map with incoming states keyed by agentId', () => {
    useSessionStore.getState().applyCharState(1000, [sample('ceo', 10, 20), sample('pm', 30, 40)]);
    const states = useSessionStore.getState().characterStates;
    expect(states.size).toBe(2);
    expect(states.get('ceo')?.x).toBe(10);
    expect(states.get('pm')?.x).toBe(30);
  });

  it('applyCharState drops frames with ts <= lastCharStateTs', () => {
    useSessionStore.getState().applyCharState(1000, [sample('ceo', 10, 20)]);
    useSessionStore.getState().applyCharState(999, [sample('ceo', 999, 999)]);
    expect(useSessionStore.getState().characterStates.get('ceo')?.x).toBe(10);
  });

  it('applyCharState drops frames with equal ts (idempotent replay)', () => {
    useSessionStore.getState().applyCharState(1000, [sample('ceo', 10, 20)]);
    useSessionStore.getState().applyCharState(1000, [sample('ceo', 999, 999)]);
    expect(useSessionStore.getState().characterStates.get('ceo')?.x).toBe(10);
  });

  it('applyCharState updates lastCharStateTs on accept', () => {
    useSessionStore.getState().applyCharState(1500, []);
    expect(useSessionStore.getState().lastCharStateTs).toBe(1500);
  });

  it('clearCharStates empties the Map and resets lastCharStateTs', () => {
    useSessionStore.getState().applyCharState(1000, [sample('ceo', 10, 20)]);
    useSessionStore.getState().clearCharStates();
    expect(useSessionStore.getState().characterStates.size).toBe(0);
    expect(useSessionStore.getState().lastCharStateTs).toBe(0);
  });
});

const BASE: SessionSnapshot = {
  sessionActive: false,
  sessionId: 's',
  desktopName: 'd',
  phase: 'idle',
  startedAt: 0,
  activeAgentId: null,
  characters: [],
  chatTail: [],
  sessionEnded: false,
};

describe('session.store applyStatePatch', () => {
  beforeEach(() => {
    useSessionStore.setState({ snapshot: { ...BASE }, pendingEvents: [] });
  });

  it('waiting patch with payload sets snapshot.waiting', () => {
    useSessionStore.getState().applyStatePatch({
      kind: 'waiting',
      payload: { sessionId: 's1', agentRole: 'ceo', questions: [] },
    });
    expect(useSessionStore.getState().snapshot?.waiting).toEqual({
      sessionId: 's1',
      agentRole: 'ceo',
      questions: [],
    });
  });

  it('waiting patch with null clears snapshot.waiting', () => {
    useSessionStore.setState({
      snapshot: {
        ...BASE,
        waiting: { sessionId: 's1', agentRole: 'ceo', questions: [] },
      },
    });
    useSessionStore.getState().applyStatePatch({ kind: 'waiting', payload: null });
    expect(useSessionStore.getState().snapshot?.waiting).toBeUndefined();
  });

  it('archivedRuns patch with resetTail:true updates both archivedRuns and clears chatTail', () => {
    useSessionStore.setState({
      snapshot: {
        ...BASE,
        chatTail: [{ id: 'm1', role: 'user', text: 'hi', timestamp: 1 }],
      },
    });
    const runs: import('../../types').ArchivedRun[] = [
      { agentRole: 'ceo', runNumber: 1, messages: [], timestamp: 100 },
    ];
    useSessionStore.getState().applyStatePatch({
      kind: 'archivedRuns', runs, resetTail: true,
    });
    const snap = useSessionStore.getState().snapshot!;
    expect(snap.archivedRuns).toEqual(runs);
    expect(snap.chatTail).toEqual([]);
  });

  it('archivedRuns patch with resetTail:false keeps chatTail', () => {
    useSessionStore.setState({
      snapshot: {
        ...BASE,
        chatTail: [{ id: 'm1', role: 'user', text: 'hi', timestamp: 1 }],
      },
    });
    useSessionStore.getState().applyStatePatch({
      kind: 'archivedRuns', runs: [], resetTail: false,
    });
    const snap = useSessionStore.getState().snapshot!;
    expect(snap.chatTail).toHaveLength(1);
  });
});

describe('session.store appendChat', () => {
  beforeEach(() => {
    useSessionStore.setState({ snapshot: { ...BASE }, pendingEvents: [] });
  });

  it('appendChat does not cap — 60 messages stay in chatTail', () => {
    const msgs = Array.from({ length: 60 }, (_, i) => ({
      id: `m${i}`, role: 'user' as const, text: `hi${i}`, timestamp: i,
    }));
    useSessionStore.getState().appendChat(msgs);
    expect(useSessionStore.getState().snapshot!.chatTail).toHaveLength(60);
  });
});

describe('session.store scope fields pass through setSnapshot', () => {
  it('preserves sessionActive=false, sessionId=null, projectName=undefined on a Lobby snapshot', () => {
    const snap: SessionSnapshot = {
      ...BASE,
      sessionActive: false,
      sessionId: null,
      projectName: undefined,
      projectRoot: undefined,
    };
    useSessionStore.getState().setSnapshot(snap);
    const result = useSessionStore.getState().snapshot!;
    expect(result.sessionActive).toBe(false);
    expect(result.sessionId).toBeNull();
    expect(result.projectName).toBeUndefined();
    expect(result.projectRoot).toBeUndefined();
  });

  it('preserves sessionActive=true with session metadata on an Office snapshot', () => {
    const snap: SessionSnapshot = {
      ...BASE,
      sessionActive: true,
      sessionId: '/Users/me/projects/foo',
      projectName: 'foo',
      projectRoot: '/Users/me/projects/foo',
    };
    useSessionStore.getState().setSnapshot(snap);
    const result = useSessionStore.getState().snapshot!;
    expect(result.sessionActive).toBe(true);
    expect(result.sessionId).toBe('/Users/me/projects/foo');
    expect(result.projectName).toBe('foo');
    expect(result.projectRoot).toBe('/Users/me/projects/foo');
  });
});
