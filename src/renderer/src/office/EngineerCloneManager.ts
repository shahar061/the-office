import type { AgentRole } from '../../../shared/types';

/**
 * Minimal PixiJS-free interface for a clone returned by the scene.
 * EngineerCloneManager only interacts with clones through this surface,
 * which keeps the manager unit-testable without a real scene.
 */
export interface MockClone {
  walkToAndThen(tile: { x: number; y: number }, cb: () => void): void;
  setWorking(state: 'type' | 'read'): void;
  getDeskTile(): { x: number; y: number };
}

/**
 * Minimal scene interface that EngineerCloneManager calls into.
 * The real OfficeScene implements this (plus much more) — tests provide
 * a mock with the same shape.
 */
export interface SceneLike {
  reserveFreeSeat(): string | null;
  releaseSeat(seat: string): void;
  createClone(cloneId: string, role: AgentRole, seat: string): MockClone | null;
  destroyClone(cloneId: string): void;
  getClone(cloneId: string): MockClone | null;
  hideCharacter(role: AgentRole): void;
  showCharacter(role: AgentRole): void;
  setMonitorGlow(seat: string, on: boolean): void;
  getEntrancePosition(): { x: number; y: number };
}

interface CloneEntry {
  cloneId: string;
  seat: string;
  refCount: number;
}

/**
 * Manages the lifecycle of engineer character clones at PC desks.
 *
 * When an engineering-role agent session starts, spawns a clone, walks it to
 * an empty PC, glows the monitor, and plays the typing animation. On session
 * end, turns off the glow, walks the clone out, destroys it, and restores the
 * base character.
 *
 * Uses ref-counting to handle concurrent sessions of the same role: if two
 * sessions of `backend-engineer` overlap, they share a single clone. The clone
 * despawns only when the ref count drops to zero.
 */
export class EngineerCloneManager {
  private readonly engineeringRoles: Set<AgentRole>;
  private clones = new Map<AgentRole, CloneEntry>();

  constructor(
    private readonly scene: SceneLike,
    engineeringRoles: readonly AgentRole[],
  ) {
    this.engineeringRoles = new Set(engineeringRoles);
  }

  /**
   * Handle an engineer session start. Ignores non-engineering roles.
   * If a clone for this role already exists, increments the ref count.
   */
  start(role: AgentRole): void {
    if (!this.engineeringRoles.has(role)) return;

    const existing = this.clones.get(role);
    if (existing) {
      existing.refCount++;
      return;
    }

    const seat = this.scene.reserveFreeSeat();
    if (!seat) {
      console.warn(`[EngineerCloneManager] no free seat for ${role}, falling back to base character`);
      return;
    }

    const cloneId = `engineer-${role}-${Date.now()}`;
    const clone = this.scene.createClone(cloneId, role, seat);
    if (!clone) {
      console.warn(`[EngineerCloneManager] createClone failed for ${role}, releasing seat`);
      this.scene.releaseSeat(seat);
      return;
    }

    this.scene.hideCharacter(role);
    this.clones.set(role, { cloneId, seat, refCount: 1 });

    clone.walkToAndThen(clone.getDeskTile(), () => {
      this.scene.setMonitorGlow(seat, true);
      clone.setWorking('type');
    });
  }

  /**
   * Handle an engineer session end. Ignores non-engineering roles and
   * no-ops if no clone is tracked for this role. Decrements ref count;
   * despawns the clone only when count drops to zero.
   */
  end(role: AgentRole): void {
    if (!this.engineeringRoles.has(role)) return;

    const entry = this.clones.get(role);
    if (!entry) return;

    entry.refCount--;
    if (entry.refCount > 0) return;

    this.scene.setMonitorGlow(entry.seat, false);

    const clone = this.scene.getClone(entry.cloneId);
    if (clone) {
      const entrance = this.scene.getEntrancePosition();
      clone.walkToAndThen(entrance, () => {
        this.scene.destroyClone(entry.cloneId);
        this.scene.releaseSeat(entry.seat);
        this.scene.showCharacter(role);
      });
    } else {
      this.scene.releaseSeat(entry.seat);
      this.scene.showCharacter(role);
    }

    this.clones.delete(role);
  }

  /** For testing: inspect current ref count for a role. */
  getRefCount(role: AgentRole): number {
    return this.clones.get(role)?.refCount ?? 0;
  }

  /** For testing: list currently-tracked roles. */
  getActiveRoles(): AgentRole[] {
    return Array.from(this.clones.keys());
  }
}
