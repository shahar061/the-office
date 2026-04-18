import { describe, it, expect } from 'vitest';
import type { MobileMessageV2 } from '../../../shared/types';
import { PerConnectionQueue } from '../per-connection-queue';

function snapshot(n: number): MobileMessageV2 {
  return {
    type: 'snapshot', v: 2,
    snapshot: {
      sessionId: `s${n}`, desktopName: 'd', phase: 'idle', startedAt: n,
      activeAgentId: null, characters: [], chatTail: [], sessionEnded: false,
    } as any,
  };
}

function event(id: number): MobileMessageV2 {
  return {
    type: 'event', v: 2,
    event: { agentId: 'a', agentRole: 'ceo', source: 'sdk', type: 'agent:created', timestamp: id } as any,
  };
}

describe('PerConnectionQueue', () => {
  it('enqueues a snapshot and drains it', () => {
    const q = new PerConnectionQueue(256);
    q.enqueue(snapshot(1));
    const out = q.drain();
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('snapshot');
  });

  it('coalesces pending snapshots to the latest', () => {
    const q = new PerConnectionQueue(256);
    q.enqueue(snapshot(1));
    q.enqueue(snapshot(2));
    q.enqueue(snapshot(3));
    const out = q.drain();
    const snaps = out.filter(m => m.type === 'snapshot');
    expect(snaps).toHaveLength(1);
    expect((snaps[0] as any).snapshot.startedAt).toBe(3);
  });

  it('orders drained messages snapshot-first, then events in FIFO', () => {
    const q = new PerConnectionQueue(256);
    q.enqueue(event(1));
    q.enqueue(snapshot(10));
    q.enqueue(event(2));
    const out = q.drain();
    expect(out.map(m => m.type)).toEqual(['snapshot', 'event', 'event']);
    expect((out[1] as any).event.timestamp).toBe(1);
    expect((out[2] as any).event.timestamp).toBe(2);
  });

  it('bounds the event buffer and sets overflow flag', () => {
    const q = new PerConnectionQueue(3);
    q.enqueue(event(1));
    q.enqueue(event(2));
    q.enqueue(event(3));
    expect(q.overflowed()).toBe(false);
    q.enqueue(event(4));
    expect(q.overflowed()).toBe(true);
    const out = q.drain();
    expect(out.filter(m => m.type === 'event')).toHaveLength(3); // oldest kept; newest dropped
  });

  it('resetOverflow clears the flag', () => {
    const q = new PerConnectionQueue(1);
    q.enqueue(event(1));
    q.enqueue(event(2));
    expect(q.overflowed()).toBe(true);
    q.resetOverflow();
    expect(q.overflowed()).toBe(false);
  });

  it('drain() empties the queue', () => {
    const q = new PerConnectionQueue(256);
    q.enqueue(event(1));
    q.drain();
    expect(q.drain()).toEqual([]);
  });

  it('queues chatFeed and state like events (bounded FIFO)', () => {
    const q = new PerConnectionQueue(256);
    q.enqueue({ type: 'chatFeed', v: 2, messages: [] } as MobileMessageV2);
    q.enqueue({ type: 'state', v: 2, patch: {} as any });
    const out = q.drain();
    expect(out.map(m => m.type)).toEqual(['chatFeed', 'state']);
  });

  it('passes control messages through unbuffered', () => {
    // Control messages (heartbeat, tokenRefresh, authed, authFailed, paired, chatAck)
    // should not be queued — they are time-sensitive.
    const q = new PerConnectionQueue(256);
    const pass = q.isPassThrough({ type: 'heartbeat', v: 2 });
    expect(pass).toBe(true);
    const pass2 = q.isPassThrough({ type: 'tokenRefresh', v: 2, token: 't', expiresAt: 1 });
    expect(pass2).toBe(true);
    const pass3 = q.isPassThrough(event(1));
    expect(pass3).toBe(false);
    const pass4 = q.isPassThrough(snapshot(1));
    expect(pass4).toBe(false);
  });
});
