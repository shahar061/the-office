import { describe, it, expect, beforeEach } from 'vitest';
import { useSpecProgressStore } from '../../src/renderer/src/stores/spec-progress.store';

describe('specProgressStore', () => {
  beforeEach(() => {
    useSpecProgressStore.getState().reset();
  });

  it('starts with no phases and not visible', () => {
    const state = useSpecProgressStore.getState();
    expect(state.phases.size).toBe(0);
    expect(state.visible).toBe(false);
  });

  it('addPhase adds a queued phase and sets visible', () => {
    useSpecProgressStore.getState().addPhase('foundation', 'Foundation');
    const state = useSpecProgressStore.getState();
    expect(state.visible).toBe(true);
    expect(state.phases.get('foundation')).toEqual({ name: 'Foundation', status: 'queued' });
  });

  it('setStatus transitions phase to active', () => {
    useSpecProgressStore.getState().addPhase('foundation', 'Foundation');
    useSpecProgressStore.getState().setStatus('foundation', 'active');
    expect(useSpecProgressStore.getState().phases.get('foundation')?.status).toBe('active');
  });

  it('setStatus transitions phase to done', () => {
    useSpecProgressStore.getState().addPhase('foundation', 'Foundation');
    useSpecProgressStore.getState().setStatus('foundation', 'done');
    expect(useSpecProgressStore.getState().phases.get('foundation')?.status).toBe('done');
  });

  it('summary counts correctly', () => {
    const { addPhase, setStatus } = useSpecProgressStore.getState();
    addPhase('a', 'A');
    addPhase('b', 'B');
    addPhase('c', 'C');
    setStatus('a', 'done');
    setStatus('b', 'active');
    const state = useSpecProgressStore.getState();
    const done = [...state.phases.values()].filter(p => p.status === 'done').length;
    const active = [...state.phases.values()].filter(p => p.status === 'active');
    expect(done).toBe(1);
    expect(active.map(p => p.name)).toEqual(['B']);
    expect(state.phases.size).toBe(3);
  });

  it('reset clears all state', () => {
    useSpecProgressStore.getState().addPhase('a', 'A');
    useSpecProgressStore.getState().reset();
    expect(useSpecProgressStore.getState().phases.size).toBe(0);
    expect(useSpecProgressStore.getState().visible).toBe(false);
  });
});
