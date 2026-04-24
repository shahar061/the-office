import { describe, it, expect } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519';
import { SessionDO } from '../session-do';

// Node-based vitest has no Cloudflare Workers runtime globals. The SessionDO
// upgrade path only runs when we expect a 101 response — stub just enough for
// those tests to reach the storage/auth assertions.
class FakeWS {
  accept() {}
  addEventListener() {}
  send() {}
  close() {}
}
if (typeof (globalThis as any).WebSocketPair === 'undefined') {
  (globalThis as any).WebSocketPair = class {
    0: FakeWS; 1: FakeWS;
    constructor() { this[0] = new FakeWS(); this[1] = new FakeWS(); }
  };
}
// Workers runtime allows `new Response(null, { status: 101, webSocket })`;
// Node's Response rejects 101. Wrap the constructor to pass 101 through as a
// simulated response object with the status preserved.
const _OrigResponse = globalThis.Response;
(globalThis as any).Response = new Proxy(_OrigResponse, {
  construct(target, args: any[]) {
    const [body, init] = args;
    if (init && typeof init === 'object' && init.status === 101) {
      // Build a minimal stand-in so tests can assert `.status === 101`.
      const headers = new Headers(init.headers ?? {});
      return { status: 101, headers, body, webSocket: init.webSocket ?? null } as any;
    }
    return new (target as any)(body, init);
  },
});

function makeStorage() {
  const map = new Map<string, unknown>();
  return {
    get: async <T>(key: string): Promise<T | undefined> => map.get(key) as T | undefined,
    put: async <T>(key: string, value: T): Promise<void> => { map.set(key, value); },
    delete: async (key: string): Promise<boolean> => map.delete(key),
    _raw: map,
  };
}

function makeState(storage = makeStorage()): any {
  return {
    id: { name: 'test', toString: () => 'test' },
    storage,
  };
}

function signToken(priv: Uint8Array, claims: any): string {
  const body = btoa(JSON.stringify(claims));
  const sig = ed25519.sign(new TextEncoder().encode(body), priv);
  return `${body}.${btoa(String.fromCharCode(...sig))}`;
}

function b64url(u: Uint8Array): string {
  return btoa(String.fromCharCode(...u))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

describe('SessionDO.fetch', () => {
  it('returns 426 for non-websocket GET', async () => {
    const do_ = new SessionDO(makeState(), {} as any);
    const res = await do_.fetch(new Request('https://test/s/abc'));
    expect(res.status).toBe(426);
  });

  it('revoke returns 404 when no session has been established', async () => {
    const do_ = new SessionDO(makeState(), {} as any);
    // revoke can't happen before first desktop connect sets pairSignPub.
    const res = await do_.fetch(new Request('https://test/s/abc/revoke', { method: 'POST' }));
    expect(res.status).toBe(404);
  });

  it('rejects first connect without X-PairSign-Pub header', async () => {
    const do_ = new SessionDO(makeState(), {} as any);
    const res = await do_.fetch(
      new Request('https://test/s/abc', {
        headers: { Upgrade: 'websocket', Authorization: 'Bearer foo.bar' },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('rejects malformed token', async () => {
    const do_ = new SessionDO(makeState(), {} as any);
    const priv = ed25519.utils.randomPrivateKey();
    const pub = ed25519.getPublicKey(priv);
    const res = await do_.fetch(
      new Request('https://test/s/abc', {
        headers: {
          Upgrade: 'websocket',
          Authorization: 'Bearer notatoken',
          'X-PairSign-Pub': b64url(pub),
        },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('rejects phone token on first connect (must be desktop)', async () => {
    const do_ = new SessionDO(makeState(), {} as any);
    const priv = ed25519.utils.randomPrivateKey();
    const pub = ed25519.getPublicKey(priv);
    const token = signToken(priv, {
      sid: 'abc',
      role: 'phone',
      epoch: 1,
      exp: Date.now() + 60_000,
    });
    const res = await do_.fetch(
      new Request('https://test/s/abc', {
        headers: {
          Upgrade: 'websocket',
          Authorization: `Bearer ${token}`,
          'X-PairSign-Pub': b64url(pub),
        },
      }),
    );
    expect(res.status).toBe(401);
  });

describe('SessionDO — storage persistence', () => {
  it('persists pairSignPub on first-desktop-connect so a fresh isolate authenticates a phone without another desktop connect', async () => {
    const storage = makeStorage();
    const priv = ed25519.utils.randomPrivateKey();
    const pub = ed25519.getPublicKey(priv);

    const first = new SessionDO(makeState(storage), {} as any);
    const desktopToken = signToken(priv, {
      sid: 'abc', role: 'desktop', epoch: 1, exp: Date.now() + 60_000,
    });
    const firstRes = await first.fetch(new Request('https://test/s/abc', {
      headers: {
        Upgrade: 'websocket',
        Authorization: `Bearer ${desktopToken}`,
        'X-PairSign-Pub': b64url(pub),
      },
    }));
    expect(firstRes.status).toBe(101);
    expect(await storage.get('pairSignPub')).toBeInstanceOf(Uint8Array);

    const second = new SessionDO(makeState(storage), {} as any);
    const phoneToken = signToken(priv, {
      sid: 'abc', role: 'phone', epoch: 1, exp: Date.now() + 60_000,
    });
    const secondRes = await second.fetch(new Request('https://test/s/abc', {
      headers: {
        Upgrade: 'websocket',
        'Sec-WebSocket-Protocol': `token.${phoneToken}`,
      },
    }));
    expect(secondRes.status).toBe(101);
  });

  it('persists epoch after revoke so a fresh isolate rejects tokens signed with the old epoch', async () => {
    const storage = makeStorage();
    const priv = ed25519.utils.randomPrivateKey();
    const pub = ed25519.getPublicKey(priv);

    const first = new SessionDO(makeState(storage), {} as any);
    const desktopToken = signToken(priv, {
      sid: 'abc', role: 'desktop', epoch: 1, exp: Date.now() + 60_000,
    });
    await first.fetch(new Request('https://test/s/abc', {
      headers: {
        Upgrade: 'websocket',
        Authorization: `Bearer ${desktopToken}`,
        'X-PairSign-Pub': b64url(pub),
      },
    }));
    const revokeRes = await first.fetch(new Request('https://test/s/abc/revoke', {
      method: 'POST',
      headers: { Authorization: `Bearer ${desktopToken}` },
    }));
    expect(revokeRes.status).toBe(200);
    expect(await storage.get('epoch')).toBe(2);

    const second = new SessionDO(makeState(storage), {} as any);
    const staleToken = signToken(priv, {
      sid: 'abc', role: 'desktop', epoch: 1, exp: Date.now() + 60_000,
    });
    const secondRes = await second.fetch(new Request('https://test/s/abc', {
      headers: {
        Upgrade: 'websocket',
        Authorization: `Bearer ${staleToken}`,
        'X-PairSign-Pub': b64url(pub),
      },
    }));
    expect(secondRes.status).toBe(401);

    const freshToken = signToken(priv, {
      sid: 'abc', role: 'desktop', epoch: 2, exp: Date.now() + 60_000,
    });
    const freshRes = await second.fetch(new Request('https://test/s/abc', {
      headers: {
        Upgrade: 'websocket',
        Authorization: `Bearer ${freshToken}`,
        'X-PairSign-Pub': b64url(pub),
      },
    }));
    expect(freshRes.status).toBe(101);
  });
});
});
