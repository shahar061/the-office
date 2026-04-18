import { describe, it, expect } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519';
import { SessionDO } from '../session-do';

function makeState(): any {
  return {
    id: { name: 'test', toString: () => 'test' },
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
});
