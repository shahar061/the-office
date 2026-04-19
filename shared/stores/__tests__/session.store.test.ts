import { describe, it, expect, beforeEach } from 'vitest';
import { useSessionStore } from '../session.store';
import type { CharacterState } from '../../types';

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
