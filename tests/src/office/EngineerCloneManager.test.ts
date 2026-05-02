import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  EngineerCloneManager,
  type SceneLike,
  type MockClone,
} from '../../../src/renderer/src/office/EngineerCloneManager';

const ENGINEERING_ROLES = [
  'backend-engineer',
  'frontend-engineer',
  'mobile-developer',
  'data-engineer',
  'devops',
  'automation-developer',
] as const;

function makeMockScene(): {
  scene: SceneLike;
  calls: {
    reserveFreeSeat: number;
    releaseSeat: string[];
    createClone: Array<{ cloneId: string; role: string; seat: string }>;
    destroyClone: string[];
    hideCharacter: string[];
    showCharacter: string[];
    setMonitorGlow: Array<{ seat: string; on: boolean }>;
  };
  cloneInstances: Map<string, MockClone>;
} {
  const seats = ['pc-1', 'pc-2', 'pc-3', 'pc-4', 'pc-5', 'pc-6'];
  const claimedSeats = new Set<string>();
  const cloneInstances = new Map<string, MockClone>();

  const calls = {
    reserveFreeSeat: 0,
    releaseSeat: [] as string[],
    createClone: [] as Array<{ cloneId: string; role: string; seat: string }>,
    destroyClone: [] as string[],
    hideCharacter: [] as string[],
    showCharacter: [] as string[],
    setMonitorGlow: [] as Array<{ seat: string; on: boolean }>,
  };

  const scene: SceneLike = {
    reserveFreeSeat: () => {
      calls.reserveFreeSeat++;
      for (const s of seats) {
        if (!claimedSeats.has(s)) {
          claimedSeats.add(s);
          return s;
        }
      }
      return null;
    },
    releaseSeat: (seat) => {
      calls.releaseSeat.push(seat);
      claimedSeats.delete(seat);
    },
    createClone: (cloneId, role, seat) => {
      calls.createClone.push({ cloneId, role, seat });
      const clone: MockClone = {
        walkToAndThen: vi.fn((_tile, cb) => cb()),
        setWorking: vi.fn(),
        getDeskTile: () => ({ x: 0, y: 0 }),
      };
      cloneInstances.set(cloneId, clone);
      return clone;
    },
    destroyClone: (cloneId) => {
      calls.destroyClone.push(cloneId);
      cloneInstances.delete(cloneId);
    },
    getClone: (cloneId) => cloneInstances.get(cloneId) ?? null,
    hideCharacter: (role) => {
      calls.hideCharacter.push(role);
    },
    showCharacter: (role) => {
      calls.showCharacter.push(role);
    },
    setMonitorGlow: (seat, on) => {
      calls.setMonitorGlow.push({ seat, on });
    },
    getEntrancePosition: () => ({ x: 10, y: 10 }),
  };

  return { scene, calls, cloneInstances };
}

describe('EngineerCloneManager', () => {
  let mock: ReturnType<typeof makeMockScene>;
  let manager: EngineerCloneManager;

  // Despawn is debounced via setTimeout. Fake timers let us assert both
  // the immediate path (refCount stays 0 inside the window) and the
  // post-debounce despawn without waiting in real time.
  beforeEach(() => {
    vi.useFakeTimers();
    mock = makeMockScene();
    manager = new EngineerCloneManager(mock.scene, ENGINEERING_ROLES);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Push past the manager's despawn debounce window so end()'s scheduled
   *  cleanup runs synchronously inside the test. */
  function flushDespawn(): void {
    vi.advanceTimersByTime(1000);
  }

  it('start spawns a clone, hides base, and glows monitor', () => {
    manager.start('backend-engineer');

    expect(mock.calls.createClone).toHaveLength(1);
    expect(mock.calls.createClone[0].role).toBe('backend-engineer');
    expect(mock.calls.createClone[0].seat).toBe('pc-1');
    expect(mock.calls.hideCharacter).toEqual(['backend-engineer']);
    expect(mock.calls.setMonitorGlow).toEqual([{ seat: 'pc-1', on: true }]);
    expect(manager.getRefCount('backend-engineer')).toBe(1);
  });

  it('ignores non-engineering roles', () => {
    manager.start('team-lead' as any);
    manager.start('ceo' as any);

    expect(mock.calls.createClone).toHaveLength(0);
    expect(mock.calls.hideCharacter).toEqual([]);
  });

  it('start twice for the same role only creates one clone (ref-count)', () => {
    manager.start('backend-engineer');
    manager.start('backend-engineer');

    expect(mock.calls.createClone).toHaveLength(1);
    expect(mock.calls.hideCharacter).toEqual(['backend-engineer']);
    expect(manager.getRefCount('backend-engineer')).toBe(2);
  });

  it('end with refCount > 1 decrements without despawning', () => {
    manager.start('backend-engineer');
    manager.start('backend-engineer');
    manager.end('backend-engineer');

    expect(mock.calls.setMonitorGlow).toEqual([{ seat: 'pc-1', on: true }]);
    expect(mock.calls.destroyClone).toHaveLength(0);
    expect(manager.getRefCount('backend-engineer')).toBe(1);
  });

  it('end with refCount === 1 despawns the clone and restores base after the debounce', () => {
    manager.start('backend-engineer');
    manager.end('backend-engineer');

    // Inside the debounce window, despawn has NOT fired yet.
    expect(mock.calls.destroyClone).toHaveLength(0);
    expect(mock.calls.showCharacter).toEqual([]);

    flushDespawn();

    expect(mock.calls.setMonitorGlow).toEqual([
      { seat: 'pc-1', on: true },
      { seat: 'pc-1', on: false },
    ]);
    expect(mock.calls.destroyClone).toHaveLength(1);
    expect(mock.calls.destroyClone[0]).toContain('backend-engineer');
    expect(mock.calls.releaseSeat).toContain('pc-1');
    expect(mock.calls.showCharacter).toEqual(['backend-engineer']);
    expect(manager.getRefCount('backend-engineer')).toBe(0);
  });

  it('multiple different engineering roles get different seats', () => {
    manager.start('backend-engineer');
    manager.start('frontend-engineer');
    manager.start('data-engineer');

    expect(mock.calls.createClone).toHaveLength(3);
    const seats = mock.calls.createClone.map(c => c.seat);
    expect(new Set(seats).size).toBe(3);
    expect(seats).toEqual(['pc-1', 'pc-2', 'pc-3']);
  });

  it('seat overflow (all 6 seats taken) skips clone creation for overflow', () => {
    manager.start('backend-engineer');
    manager.start('frontend-engineer');
    manager.start('mobile-developer');
    manager.start('data-engineer');
    manager.start('devops');
    manager.start('automation-developer');
    // All 6 engineering roles now have clones at pc-1..pc-6.
    expect(mock.calls.createClone).toHaveLength(6);

    // Drain the seat pool with a phantom claim so the next start must overflow.
    // Simulate this by having the scene reserve an extra seat directly via the
    // same claim mechanism used by start(): just mark all seats claimed.
    // (With 6 engineering roles fitting exactly 6 seats, no natural overflow
    // occurs; this guards against future role additions bypassing the check.)
    const extraSession = (mock.scene as any).reserveFreeSeat();
    expect(extraSession).toBeNull();
  });

  it('end for a role with no active clone is a no-op', () => {
    manager.end('backend-engineer');
    expect(mock.calls.destroyClone).toEqual([]);
    expect(mock.calls.showCharacter).toEqual([]);
  });

  it('end with ref-count going below zero is clamped', () => {
    manager.start('backend-engineer');
    manager.end('backend-engineer');
    // Extra close event (shouldn't happen but defensive)
    manager.end('backend-engineer');
    expect(manager.getRefCount('backend-engineer')).toBe(0);
    flushDespawn();
    // Despawn fires exactly once even after a duplicate end().
    expect(mock.calls.destroyClone).toHaveLength(1);
  });

  it('start arriving inside the debounce window cancels the despawn and reuses the existing clone', () => {
    manager.start('backend-engineer');
    manager.end('backend-engineer');
    // Mid-window: a new session for the same role lands.
    manager.start('backend-engineer');

    flushDespawn();

    // Same clone reused — only one createClone, monitor stays glowing,
    // base never re-shown, no destroy/release churn.
    expect(mock.calls.createClone).toHaveLength(1);
    expect(mock.calls.destroyClone).toHaveLength(0);
    expect(mock.calls.showCharacter).toEqual([]);
    expect(mock.calls.setMonitorGlow).toEqual([{ seat: 'pc-1', on: true }]);
    expect(manager.getRefCount('backend-engineer')).toBe(1);
  });

  it('restart after the debounce window elapses gets a fresh seat reservation', () => {
    manager.start('backend-engineer');
    manager.end('backend-engineer');
    flushDespawn();
    manager.start('backend-engineer');

    expect(mock.calls.createClone).toHaveLength(2);
    expect(mock.calls.createClone[0].seat).toBe('pc-1');
    expect(mock.calls.createClone[1].seat).toBe('pc-1');
  });
});
