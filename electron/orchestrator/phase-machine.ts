import { EventEmitter } from 'events';
import type { Phase, PhaseInfo } from '../../shared/types';

// Valid forward transitions
const FORWARD_TRANSITIONS: Record<Phase, Phase | null> = {
  idle: 'imagine',
  imagine: 'warroom',
  warroom: 'build',
  build: 'complete',
  complete: null,
};

export const PHASE_ORDER: Phase[] = ['idle', 'imagine', 'warroom', 'build', 'complete'];

export class PhaseMachine extends EventEmitter {
  private _currentPhase: Phase;
  private _completedPhases: Set<Phase>;

  constructor(initialPhase: Phase = 'idle', completedPhases: Phase[] = []) {
    super();
    this._currentPhase = initialPhase;
    this._completedPhases = new Set(completedPhases);
  }

  get currentPhase(): Phase {
    return this._currentPhase;
  }

  get completedPhases(): Phase[] {
    return PHASE_ORDER.filter(p => this._completedPhases.has(p));
  }

  transition(target: Phase): void {
    const from = this._currentPhase;

    const isSame = from === target;
    const isForward = FORWARD_TRANSITIONS[from] === target;
    const isBackward = PHASE_ORDER.indexOf(target) < PHASE_ORDER.indexOf(from)
                       && target !== 'idle';

    if (!isSame && !isForward && !isBackward) {
      throw new Error(
        `Invalid transition: '${from}' → '${target}'`
      );
    }

    this._currentPhase = target;

    const info: PhaseInfo = { phase: target, status: 'active' };
    this.emit('change', info);
  }

  clearCompletedFrom(phase: Phase): void {
    const idx = PHASE_ORDER.indexOf(phase);
    if (idx === -1) return;
    for (const p of PHASE_ORDER.slice(idx)) {
      this._completedPhases.delete(p);
    }
  }

  markCompleted(phase: Phase): void {
    this._completedPhases.add(phase);
    const info: PhaseInfo = { phase, status: 'completed' };
    this.emit('change', info);
  }

  markFailed(): void {
    const info: PhaseInfo = { phase: this._currentPhase, status: 'failed' };
    this.emit('change', info);
  }

  markInterrupted(): void {
    const info: PhaseInfo = { phase: this._currentPhase, status: 'interrupted' };
    this.emit('change', info);
  }
}
