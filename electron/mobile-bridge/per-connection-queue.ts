// electron/mobile-bridge/per-connection-queue.ts
// Backpressure queue for a single outbound connection.
// - Snapshots coalesce: only the latest pending snapshot is kept.
// - Events, chatFeed, state, chatAck, charState are bounded FIFO (default 256).
// - Control messages (heartbeat, tokenRefresh, authed, authFailed, paired) are
//   classified as pass-through — callers should send them directly without
//   passing through this queue.

import type { MobileMessageV2 } from '../../shared/types';

const BUFFERED_TYPES = new Set<MobileMessageV2['type']>([
  'event', 'chatFeed', 'state', 'chatAck', 'charState',
]);
const SNAPSHOT_TYPES = new Set<MobileMessageV2['type']>(['snapshot']);

export class PerConnectionQueue {
  private pendingSnapshot: MobileMessageV2 | null = null;
  private buffer: MobileMessageV2[] = [];
  private overflow = false;

  constructor(private readonly capacity: number) {}

  /**
   * Returns true if the caller should send this message directly
   * without queueing (control messages).
   */
  isPassThrough(msg: MobileMessageV2): boolean {
    return !SNAPSHOT_TYPES.has(msg.type) && !BUFFERED_TYPES.has(msg.type);
  }

  /**
   * Enqueue a snapshot (coalesces) or a bounded-buffer message (event, chatFeed,
   * state, chatAck). Control messages should be handled outside the queue; if
   * passed in, they are silently dropped.
   */
  enqueue(msg: MobileMessageV2): void {
    if (SNAPSHOT_TYPES.has(msg.type)) {
      this.pendingSnapshot = msg;
      return;
    }
    if (!BUFFERED_TYPES.has(msg.type)) return;
    if (this.buffer.length >= this.capacity) {
      this.overflow = true;
      return; // drop newest; preserve oldest FIFO so replay is predictable
    }
    this.buffer.push(msg);
  }

  /**
   * Drain the queue in send order: pending snapshot first (if any), then
   * buffered messages in FIFO. Empties the queue.
   */
  drain(): MobileMessageV2[] {
    const out: MobileMessageV2[] = [];
    if (this.pendingSnapshot) {
      out.push(this.pendingSnapshot);
      this.pendingSnapshot = null;
    }
    if (this.buffer.length > 0) {
      out.push(...this.buffer);
      this.buffer = [];
    }
    return out;
  }

  overflowed(): boolean {
    return this.overflow;
  }

  resetOverflow(): void {
    this.overflow = false;
  }

  isEmpty(): boolean {
    return this.pendingSnapshot === null && this.buffer.length === 0;
  }

  size(): number {
    return (this.pendingSnapshot ? 1 : 0) + this.buffer.length;
  }
}
