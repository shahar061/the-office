import { describe, it, expect, vi } from 'vitest';
import { PhaseMachine } from '../../electron/orchestrator/phase-machine';
import type { PhaseInfo } from '../../shared/types';

describe('PhaseMachine', () => {
  describe('initial state', () => {
    it('starts in idle by default', () => {
      const machine = new PhaseMachine();
      expect(machine.currentPhase).toBe('idle');
    });

    it('accepts a custom initial phase', () => {
      const machine = new PhaseMachine('warroom');
      expect(machine.currentPhase).toBe('warroom');
    });

    it('has empty completedPhases by default', () => {
      const machine = new PhaseMachine();
      expect(machine.completedPhases).toEqual([]);
    });
  });

  describe('forward transitions', () => {
    it('transitions idle → imagine', () => {
      const machine = new PhaseMachine();
      machine.transition('imagine');
      expect(machine.currentPhase).toBe('imagine');
    });

    it('transitions imagine → warroom', () => {
      const machine = new PhaseMachine('imagine');
      machine.transition('warroom');
      expect(machine.currentPhase).toBe('warroom');
    });

    it('transitions warroom → build', () => {
      const machine = new PhaseMachine('warroom');
      machine.transition('build');
      expect(machine.currentPhase).toBe('build');
    });

    it('transitions build → complete', () => {
      const machine = new PhaseMachine('build');
      machine.transition('complete');
      expect(machine.currentPhase).toBe('complete');
    });

    it('traverses the full forward chain', () => {
      const machine = new PhaseMachine();
      machine.transition('imagine');
      machine.transition('warroom');
      machine.transition('build');
      machine.transition('complete');
      expect(machine.currentPhase).toBe('complete');
    });
  });

  describe('backward transitions (redo)', () => {
    it('allows warroom → imagine', () => {
      const machine = new PhaseMachine('warroom');
      machine.transition('imagine');
      expect(machine.currentPhase).toBe('imagine');
    });

    it('allows build → imagine', () => {
      const machine = new PhaseMachine('build');
      machine.transition('imagine');
      expect(machine.currentPhase).toBe('imagine');
    });

    it('allows complete → imagine', () => {
      const machine = new PhaseMachine('complete');
      machine.transition('imagine');
      expect(machine.currentPhase).toBe('imagine');
    });

    it('allows build → warroom', () => {
      const machine = new PhaseMachine('build');
      machine.transition('warroom');
      expect(machine.currentPhase).toBe('warroom');
    });

    it('allows complete → warroom', () => {
      const machine = new PhaseMachine('complete');
      machine.transition('warroom');
      expect(machine.currentPhase).toBe('warroom');
    });

    it('allows complete → build', () => {
      const machine = new PhaseMachine('complete');
      machine.transition('build');
      expect(machine.currentPhase).toBe('build');
    });

    it('rejects any transition to idle', () => {
      const machine = new PhaseMachine('imagine');
      expect(() => machine.transition('idle')).toThrow(
        "Invalid transition: 'imagine' → 'idle'"
      );
    });
  });

  describe('invalid transitions', () => {
    it('rejects idle → build (skipping phases)', () => {
      const machine = new PhaseMachine();
      expect(() => machine.transition('build')).toThrow(
        "Invalid transition: 'idle' → 'build'"
      );
    });

    it('rejects idle → warroom', () => {
      const machine = new PhaseMachine();
      expect(() => machine.transition('warroom')).toThrow();
    });

    it('rejects idle → complete', () => {
      const machine = new PhaseMachine();
      expect(() => machine.transition('complete')).toThrow();
    });

    it('rejects imagine → build (skipping warroom)', () => {
      const machine = new PhaseMachine('imagine');
      expect(() => machine.transition('build')).toThrow();
    });

    it('rejects complete → idle', () => {
      const machine = new PhaseMachine('complete');
      expect(() => machine.transition('idle')).toThrow();
    });

    it('does not change currentPhase on invalid transition', () => {
      const machine = new PhaseMachine();
      try {
        machine.transition('build');
      } catch {
        // expected
      }
      expect(machine.currentPhase).toBe('idle');
    });
  });

  describe('change events', () => {
    it('emits change event on valid transition', () => {
      const machine = new PhaseMachine();
      const handler = vi.fn();
      machine.on('change', handler);
      machine.transition('imagine');
      expect(handler).toHaveBeenCalledOnce();
      const info: PhaseInfo = handler.mock.calls[0][0];
      expect(info.phase).toBe('imagine');
      expect(info.status).toBe('active');
    });

    it('does not emit change event on invalid transition', () => {
      const machine = new PhaseMachine();
      const handler = vi.fn();
      machine.on('change', handler);
      try {
        machine.transition('build');
      } catch {
        // expected
      }
      expect(handler).not.toHaveBeenCalled();
    });

    it('emits change with completed status on markCompleted', () => {
      const machine = new PhaseMachine('imagine');
      const handler = vi.fn();
      machine.on('change', handler);
      machine.markCompleted('imagine');
      expect(handler).toHaveBeenCalledOnce();
      const info: PhaseInfo = handler.mock.calls[0][0];
      expect(info.phase).toBe('imagine');
      expect(info.status).toBe('completed');
    });

    it('emits change with failed status on markFailed', () => {
      const machine = new PhaseMachine('warroom');
      const handler = vi.fn();
      machine.on('change', handler);
      machine.markFailed();
      expect(handler).toHaveBeenCalledOnce();
      const info: PhaseInfo = handler.mock.calls[0][0];
      expect(info.phase).toBe('warroom');
      expect(info.status).toBe('failed');
    });

    it('emits change with interrupted status on markInterrupted', () => {
      const machine = new PhaseMachine('build');
      const handler = vi.fn();
      machine.on('change', handler);
      machine.markInterrupted();
      expect(handler).toHaveBeenCalledOnce();
      const info: PhaseInfo = handler.mock.calls[0][0];
      expect(info.phase).toBe('build');
      expect(info.status).toBe('interrupted');
    });
  });

  describe('completed phases tracking', () => {
    it('starts with no completed phases', () => {
      const machine = new PhaseMachine();
      expect(machine.completedPhases).toHaveLength(0);
    });

    it('tracks a single completed phase', () => {
      const machine = new PhaseMachine('imagine');
      machine.markCompleted('imagine');
      expect(machine.completedPhases).toContain('imagine');
    });

    it('tracks multiple completed phases', () => {
      const machine = new PhaseMachine('build');
      machine.markCompleted('imagine');
      machine.markCompleted('warroom');
      machine.markCompleted('build');
      expect(machine.completedPhases).toContain('imagine');
      expect(machine.completedPhases).toContain('warroom');
      expect(machine.completedPhases).toContain('build');
      expect(machine.completedPhases).toHaveLength(3);
    });

    it('does not duplicate completed phases', () => {
      const machine = new PhaseMachine('imagine');
      machine.markCompleted('imagine');
      machine.markCompleted('imagine');
      expect(machine.completedPhases).toHaveLength(1);
    });

    it('returns a copy so mutation does not affect internal state', () => {
      const machine = new PhaseMachine('imagine');
      machine.markCompleted('imagine');
      const arr = machine.completedPhases;
      arr.push('warroom' as any);
      expect(machine.completedPhases).toHaveLength(1);
    });
  });

  describe('clearCompletedFrom', () => {
    it('clears target phase and all subsequent phases', () => {
      const machine = new PhaseMachine('complete', ['imagine', 'warroom', 'build', 'complete']);
      machine.clearCompletedFrom('warroom');
      expect(machine.completedPhases).toEqual(['imagine']);
    });

    it('clears all phases when clearing from imagine', () => {
      const machine = new PhaseMachine('complete', ['imagine', 'warroom', 'build', 'complete']);
      machine.clearCompletedFrom('imagine');
      expect(machine.completedPhases).toEqual([]);
    });

    it('does nothing when clearing from a phase not in completed set', () => {
      const machine = new PhaseMachine('warroom', ['imagine']);
      machine.clearCompletedFrom('build');
      expect(machine.completedPhases).toEqual(['imagine']);
    });

    it('clears only the target when it is the last completed phase', () => {
      const machine = new PhaseMachine('build', ['imagine', 'warroom']);
      machine.clearCompletedFrom('warroom');
      expect(machine.completedPhases).toEqual(['imagine']);
    });
  });

  describe('state restoration', () => {
    it('restores from saved initialPhase and completedPhases', () => {
      const machine = new PhaseMachine('build', ['imagine', 'warroom']);
      expect(machine.currentPhase).toBe('build');
      expect(machine.completedPhases).toContain('imagine');
      expect(machine.completedPhases).toContain('warroom');
      expect(machine.completedPhases).toHaveLength(2);
    });

    it('can continue forward transitions after restore', () => {
      const machine = new PhaseMachine('build', ['imagine', 'warroom']);
      machine.transition('complete');
      expect(machine.currentPhase).toBe('complete');
    });

    it('can redo (backward to imagine) after restore', () => {
      const machine = new PhaseMachine('build', ['imagine', 'warroom']);
      machine.transition('imagine');
      expect(machine.currentPhase).toBe('imagine');
    });
  });
});
