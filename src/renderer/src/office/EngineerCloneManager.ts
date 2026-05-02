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
  /** Pending despawn timer when refCount has reached 0; null otherwise.
   *  Cancelling this timer keeps the clone in place across rapid
   *  consecutive sessions of the same role. */
  despawnTimer: ReturnType<typeof setTimeout> | null;
  /** ms timestamp of the most recent `start()` or `end()` for this clone.
   *  The sweep uses this to force-despawn clones whose ref count is
   *  stuck > 0 because some `agent:closed` event never arrived. */
  lastEventAt: number;
}

/** How long the manager waits after refCount reaches 0 before walking
 *  the clone out. A new `start()` arriving inside this window cancels
 *  the despawn and re-uses the existing clone. Tuned to absorb the
 *  brief gap between the build worker pool's session N closure and
 *  session N+1 opening. */
const DESPAWN_DELAY_MS = 750;

/** How often the safety sweep runs. */
const SWEEP_INTERVAL_MS = 5000;
/** A clone whose lastEventAt is older than this is treated as stale —
 *  some `agent:closed` got dropped, refCount is stuck, and we'd
 *  otherwise leave the sprite parked at a desk forever. */
const STALE_CLONE_THRESHOLD_MS = 30000;

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
 * despawns only when the ref count drops to zero AND the debounce window
 * elapses without a fresh `start()` arriving.
 */
export class EngineerCloneManager {
  private readonly engineeringRoles: Set<AgentRole>;
  private clones = new Map<AgentRole, CloneEntry>();
  private sweepInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly scene: SceneLike,
    engineeringRoles: readonly AgentRole[],
  ) {
    this.engineeringRoles = new Set(engineeringRoles);
    this.sweepInterval = setInterval(() => this.sweepStaleClones(), SWEEP_INTERVAL_MS);
  }

  /** Stop the periodic sweep — call when tearing down the manager so
   *  the timer doesn't outlive the scene. */
  dispose(): void {
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
    }
    for (const entry of this.clones.values()) {
      if (entry.despawnTimer) clearTimeout(entry.despawnTimer);
    }
  }

  /** Force-despawn any clone that hasn't received a start/end event in
   *  STALE_CLONE_THRESHOLD_MS — guards against agent:closed events that
   *  were dropped or never emitted by the SDK, which would otherwise
   *  leave the sprite parked at a desk indefinitely. */
  private sweepStaleClones(): void {
    const now = Date.now();
    for (const [role, entry] of this.clones) {
      if (now - entry.lastEventAt < STALE_CLONE_THRESHOLD_MS) continue;
      // Reset state and route through the normal despawn path so the
      // clone walks out cleanly (no teleport).
      entry.refCount = 0;
      if (entry.despawnTimer) {
        clearTimeout(entry.despawnTimer);
        entry.despawnTimer = null;
      }
      console.warn(`[EngineerCloneManager] sweep: force-despawning stale clone for ${role}`);
      this.actuallyDespawn(role);
    }
  }

  /**
   * Handle an engineer session start. Ignores non-engineering roles.
   * If a clone for this role already exists, increments the ref count
   * and cancels any pending despawn so the clone stays in place.
   */
  start(role: AgentRole): void {
    if (!this.engineeringRoles.has(role)) return;

    const existing = this.clones.get(role);
    if (existing) {
      if (existing.despawnTimer) {
        clearTimeout(existing.despawnTimer);
        existing.despawnTimer = null;
      }
      existing.refCount++;
      existing.lastEventAt = Date.now();
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
    this.clones.set(role, { cloneId, seat, refCount: 1, despawnTimer: null, lastEventAt: Date.now() });

    clone.walkToAndThen(clone.getDeskTile(), () => {
      this.scene.setMonitorGlow(seat, true);
      clone.setWorking('type');
    });
  }

  /**
   * Handle an engineer session end. Ignores non-engineering roles and
   * no-ops if no clone is tracked for this role. Decrements ref count;
   * despawns the clone only when the count drops to zero AND the
   * debounce window elapses without a new `start()` arriving.
   */
  end(role: AgentRole): void {
    if (!this.engineeringRoles.has(role)) return;

    const entry = this.clones.get(role);
    if (!entry) return;

    // Floor at 0 so a stray `closed` for a session whose `created` we never
    // saw (e.g. mid-build renderer reload) can't drive the count negative.
    entry.refCount = Math.max(0, entry.refCount - 1);
    entry.lastEventAt = Date.now();
    if (entry.refCount > 0) return;

    // Already pending — do nothing.
    if (entry.despawnTimer) return;

    entry.despawnTimer = setTimeout(() => {
      this.actuallyDespawn(role);
    }, DESPAWN_DELAY_MS);
  }

  /** Tear down the clone after the debounce window has elapsed without
   *  a fresh `start()`. Ref count is rechecked in case `start()` raced
   *  past `clearTimeout` (timers don't run inside the same microtask). */
  private actuallyDespawn(role: AgentRole): void {
    const entry = this.clones.get(role);
    if (!entry) return;
    if (entry.refCount > 0) {
      // A start() came in during the timeout's resolution window; keep clone alive.
      entry.despawnTimer = null;
      return;
    }

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
