import { describe, it, expect } from 'vitest';
import { PairingRoomDO } from '../pairing-room-do';

function makeState(): any {
  return { id: { name: 'test-room', toString: () => 'test-room' } };
}

describe('PairingRoomDO.fetch', () => {
  it('rejects missing token', async () => {
    const d = new PairingRoomDO(makeState(), {} as any);
    const res = await d.fetch(new Request('https://test/pair/room1?role=host', {
      headers: { Upgrade: 'websocket' },
    }));
    expect(res.status).toBe(401);
  });

  it('rejects too-short token', async () => {
    const d = new PairingRoomDO(makeState(), {} as any);
    const res = await d.fetch(new Request('https://test/pair/room1?role=host&token=short', {
      headers: { Upgrade: 'websocket' },
    }));
    expect(res.status).toBe(401);
  });

  it('rejects missing role', async () => {
    const d = new PairingRoomDO(makeState(), {} as any);
    const res = await d.fetch(new Request('https://test/pair/room1?token=a-reasonably-long-token', {
      headers: { Upgrade: 'websocket' },
    }));
    expect(res.status).toBe(400);
  });

  it('rejects invalid role', async () => {
    const d = new PairingRoomDO(makeState(), {} as any);
    const res = await d.fetch(new Request('https://test/pair/room1?role=alien&token=a-reasonably-long-token', {
      headers: { Upgrade: 'websocket' },
    }));
    expect(res.status).toBe(400);
  });

  it('returns 426 for non-websocket GET with valid token+role', async () => {
    const d = new PairingRoomDO(makeState(), {} as any);
    const res = await d.fetch(new Request('https://test/pair/room1?role=host&token=a-reasonably-long-token'));
    expect(res.status).toBe(426);
  });
});
