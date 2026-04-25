import { describe, it, expect } from 'vitest';
import worker from '../src/index';

function makeMockDb() {
  const rows: any[] = [
    { id: 1, type: 'bug', status: 'open', triage_note: null },
  ];
  return {
    rows,
    prepare(_sql: string) {
      return {
        bind(...args: any[]) {
          return {
            async run() {
              if (_sql.includes('UPDATE reports SET')) {
                const id = args[args.length - 1];
                const row = rows.find(r => r.id === id);
                if (!row) return { meta: { changes: 0 } };
                if (_sql.includes('status =')) row.status = args[0];
                if (_sql.includes('triage_note =')) row.triage_note = args[1];
                return { meta: { changes: 1 } };
              }
              return { meta: { changes: 0 } };
            },
            async first() {
              const id = args[0];
              return rows.find(r => r.id === id) ?? null;
            },
          };
        },
      };
    },
  };
}

const ADMIN = 'admin-token';

describe('PATCH /reports/:id', () => {
  it('401 without auth', async () => {
    const env = { DB: makeMockDb() as any, TURNSTILE_SECRET: 's', ADMIN_READ_TOKEN: ADMIN };
    const req = new Request('https://x/reports/1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'in-progress' }),
    });
    const res = await worker.fetch(req, env as any);
    expect(res.status).toBe(401);
  });

  it('200 with valid status update', async () => {
    const db = makeMockDb();
    const env = { DB: db as any, TURNSTILE_SECRET: 's', ADMIN_READ_TOKEN: ADMIN };
    const req = new Request('https://x/reports/1', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'in-progress' }),
    });
    const res = await worker.fetch(req, env as any);
    expect(res.status).toBe(200);
    expect(db.rows[0].status).toBe('in-progress');
  });

  it('400 invalid status enum', async () => {
    const env = { DB: makeMockDb() as any, TURNSTILE_SECRET: 's', ADMIN_READ_TOKEN: ADMIN };
    const req = new Request('https://x/reports/1', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'wrong' }),
    });
    const res = await worker.fetch(req, env as any);
    expect(res.status).toBe(400);
  });

  it('404 patching non-existent ID', async () => {
    const env = { DB: makeMockDb() as any, TURNSTILE_SECRET: 's', ADMIN_READ_TOKEN: ADMIN };
    const req = new Request('https://x/reports/999', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'in-progress' }),
    });
    const res = await worker.fetch(req, env as any);
    expect(res.status).toBe(404);
  });
});
