import { describe, it, expect } from 'vitest';
import worker from '../src/index';

function makeMockDb(rows: any[]) {
  return {
    prepare(sql: string) {
      return {
        bind(...args: any[]) {
          return {
            async all() {
              let filtered = rows.slice();
              if (sql.includes('status = ?') && args[0]) filtered = filtered.filter(r => r.status === args[0]);
              if (sql.includes('type = ?')) {
                const typeArgIdx = sql.includes('status = ?') ? 1 : 0;
                if (args[typeArgIdx]) filtered = filtered.filter(r => r.type === args[typeArgIdx]);
              }
              return { results: filtered };
            },
            async first() {
              const id = args[args.length - 1];
              return rows.find(r => r.id === id) ?? null;
            },
          };
        },
      };
    },
  };
}

const REPORT_ROWS = [
  {
    id: 1, type: 'bug', title: 'Crash A', body: 'desc', app_version: '1.0.0',
    os_platform: 'darwin', language: 'en', submitted_at: 100, received_at: 200,
    status: 'open', triage_note: null,
  },
  {
    id: 2, type: 'feature', title: 'Wish B', body: 'desc', app_version: '1.0.0',
    os_platform: 'win32', language: 'he', submitted_at: 100, received_at: 300,
    status: 'open', triage_note: null,
  },
];

const ENV_WITH_REPORTS = {
  DB: makeMockDb(REPORT_ROWS) as any,
  TURNSTILE_SECRET: 'secret',
  ADMIN_READ_TOKEN: 'admin-token',
};

describe('GET /reports', () => {
  it('401 without auth header', async () => {
    const req = new Request('https://x/reports');
    const res = await worker.fetch(req, ENV_WITH_REPORTS as any);
    expect(res.status).toBe(401);
  });

  it('200 with admin token, returns array', async () => {
    const req = new Request('https://x/reports', {
      headers: { Authorization: 'Bearer admin-token' },
    });
    const res = await worker.fetch(req, ENV_WITH_REPORTS as any);
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(Array.isArray(json.reports)).toBe(true);
    expect(json.reports.length).toBe(2);
  });

  it('200 GET /reports/:id with admin token', async () => {
    const req = new Request('https://x/reports/1', {
      headers: { Authorization: 'Bearer admin-token' },
    });
    const res = await worker.fetch(req, ENV_WITH_REPORTS as any);
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.id).toBe(1);
    expect(json.title).toBe('Crash A');
  });

  it('404 GET /reports/:id when not found', async () => {
    const req = new Request('https://x/reports/999', {
      headers: { Authorization: 'Bearer admin-token' },
    });
    const res = await worker.fetch(req, ENV_WITH_REPORTS as any);
    expect(res.status).toBe(404);
  });
});
