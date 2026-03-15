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

// Phases that can go backward to 'imagine' (redo)
const BACKWARD_TO_IMAGINE: Set<Phase> = new Set(['warroom', 'build', 'complete']);

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
    return Array.from(this._completedPhases);
  }

  transition(target: Phase): void {
    const from = this._currentPhase;

    const isForward = FORWARD_TRANSITIONS[from] === target;
    const isBackwardToImagine = target === 'imagine' && BACKWARD_TO_IMAGINE.has(from);

    if (!isForward && !isBackwardToImagine) {
      throw new Error(
        `Invalid transition: '${from}' → '${target}'`
      );
    }

    this._currentPhase = target;

    const info: PhaseInfo = { phase: target, status: 'active' };
    this.emit('change', info);
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
