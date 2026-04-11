/**
 * Reservation pool for a fixed ordered list of seat identifiers (e.g., PC
 * spawn points in the Tiled map). Used by both TL warroom clones and
 * engineer clones to prevent seat collisions.
 */
export class SeatPool {
  private readonly seats: readonly string[];
  private claimed = new Set<string>();

  constructor(seats: readonly string[]) {
    this.seats = seats;
  }

  /**
   * Reserve the first unoccupied seat in list order.
   * Returns the seat id, or null if all seats are taken.
   * Caller is responsible for calling release() when done.
   */
  reserveNext(): string | null {
    for (const seat of this.seats) {
      if (!this.claimed.has(seat)) {
        this.claimed.add(seat);
        return seat;
      }
    }
    return null;
  }

  /** Release a previously-reserved seat. Idempotent; releasing an un-reserved seat is a no-op. */
  release(seat: string): void {
    this.claimed.delete(seat);
  }

  /** Inspect whether a specific seat is currently reserved. */
  isReserved(seat: string): boolean {
    return this.claimed.has(seat);
  }
}
