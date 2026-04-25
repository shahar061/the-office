import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../src/index';

const D1_MOCK = (() => {
  const rows: any[] = [];
  return {
    rows,
    prepare(_sql: string) {
      return {
        bind(...args: any[]) {
          return {
            async run() {
              rows.push(args);
              return { meta: { last_row_id: rows.length } };
            },
            async first() {
              return null;
            },
            async all() {
              return { results: rows.map((r, i) => ({ id: i + 1 })) };
            },
          };
        },
      };
    },
  };
})();

const ENV = {
  DB: D1_MOCK as any,
  TURNSTILE_SECRET: 'secret',
  ADMIN_READ_TOKEN: 'admin-token',
};

beforeEach(() => {
  D1_MOCK.rows.length = 0;
  vi.restoreAllMocks();
});

function validBody() {
  return {
    type: 'bug' as const,
    title: 'Crash when X',
    body: 'Steps to reproduce: open the app and X happens.',
    appVersion: '1.0.0',
    osPlatform: 'darwin',
    language: 'en' as const,
    submittedAt: Date.now(),
    turnstileToken: 'TOKEN',
  };
}

describe('POST /reports', () => {
  it('returns 200 and ok:true on valid payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    const req = new Request('https://x/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validBody()),
    });
    const res = await worker.fetch(req, ENV as any);
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.ok).toBe(true);
    expect(typeof json.id).toBe('number');
  });

  it('400 invalid_payload when type is not enum', async () => {
    const body = { ...validBody(), type: 'wrong' };
    const req = new Request('https://x/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const res = await worker.fetch(req, ENV as any);
    expect(res.status).toBe(400);
    const json = await res.json() as any;
    expect(json.ok).toBe(false);
    expect(json.error).toBe('invalid_payload');
  });

  it('400 invalid_payload when title empty', async () => {
    const body = { ...validBody(), title: '   ' };
    const req = new Request('https://x/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const res = await worker.fetch(req, ENV as any);
    expect(res.status).toBe(400);
  });

  it('400 invalid_payload when body too short', async () => {
    const body = { ...validBody(), body: 'short' };
    const req = new Request('https://x/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const res = await worker.fetch(req, ENV as any);
    expect(res.status).toBe(400);
  });

  it('400 turnstile_failed when verify returns false', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false }), { status: 200 }),
    );
    const req = new Request('https://x/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validBody()),
    });
    const res = await worker.fetch(req, ENV as any);
    expect(res.status).toBe(400);
    const json = await res.json() as any;
    expect(json.error).toBe('turnstile_failed');
  });

  it('inserts trimmed title/body into D1', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    const body = { ...validBody(), title: '  Title with spaces  ', body: '  ' + 'a'.repeat(20) + '  ' };
    const req = new Request('https://x/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    await worker.fetch(req, ENV as any);
    const row = D1_MOCK.rows[0];
    expect(row[1]).toBe('Title with spaces');
    expect(row[2].startsWith('a')).toBe(true);
  });
});
