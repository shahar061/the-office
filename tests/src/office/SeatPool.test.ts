import { describe, it, expect } from 'vitest';
import { SeatPool } from '../../../src/renderer/src/office/SeatPool';

describe('SeatPool', () => {
  const SEATS = ['pc-1', 'pc-2', 'pc-3', 'pc-4', 'pc-5', 'pc-6'];

  it('reserveNext returns the first free seat in order', () => {
    const pool = new SeatPool(SEATS);
    expect(pool.reserveNext()).toBe('pc-1');
    expect(pool.reserveNext()).toBe('pc-2');
    expect(pool.reserveNext()).toBe('pc-3');
  });

  it('returns null when all seats are taken', () => {
    const pool = new SeatPool(SEATS);
    for (let i = 0; i < 6; i++) pool.reserveNext();
    expect(pool.reserveNext()).toBeNull();
  });

  it('release makes a seat available again', () => {
    const pool = new SeatPool(SEATS);
    pool.reserveNext(); // pc-1
    pool.reserveNext(); // pc-2
    pool.release('pc-1');
    expect(pool.reserveNext()).toBe('pc-1');
  });

  it('release returns seats in their original position in the pool', () => {
    const pool = new SeatPool(SEATS);
    for (let i = 0; i < 6; i++) pool.reserveNext();
    pool.release('pc-3');
    expect(pool.reserveNext()).toBe('pc-3');
    expect(pool.reserveNext()).toBeNull();
  });

  it('release of a non-reserved seat is a no-op', () => {
    const pool = new SeatPool(SEATS);
    pool.reserveNext(); // pc-1
    expect(() => pool.release('pc-5')).not.toThrow();
    expect(pool.reserveNext()).toBe('pc-2');
  });

  it('release called twice on the same seat is idempotent', () => {
    const pool = new SeatPool(SEATS);
    pool.reserveNext(); // pc-1
    pool.release('pc-1');
    pool.release('pc-1');
    expect(pool.reserveNext()).toBe('pc-1');
  });

  it('isReserved reports current state', () => {
    const pool = new SeatPool(SEATS);
    expect(pool.isReserved('pc-1')).toBe(false);
    pool.reserveNext();
    expect(pool.isReserved('pc-1')).toBe(true);
    pool.release('pc-1');
    expect(pool.isReserved('pc-1')).toBe(false);
  });
});
