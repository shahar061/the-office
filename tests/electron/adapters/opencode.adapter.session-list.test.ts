import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenCodeAdapter } from '../../../electron/adapters/opencode.adapter';
import type { SessionListItem } from '../../../shared/types';

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    readFileSync: vi.fn((path: string) => {
      if (path.includes('opencode.db')) {
        return Buffer.from('mock sqlite database');
      }
      return actual.readFileSync(path);
    }),
    existsSync: vi.fn((path: string) => {
      return path.includes('opencode.db');
    }),
  };
});

vi.mock('sql.js', () => ({
  default: vi.fn().mockImplementation(() => ({
    Database: vi.fn().mockImplementation(() => {
      const rows = (globalThis as any).sessionRows || [];
      return {
        exec: vi.fn((sql: string) => {
          if (sql.includes('FROM session')) {
            return [{
              columns: ['id','title','directory','project_id','time_created','time_updated'],
              values: rows
            }];
          }
          if (sql.includes('FROM part') && !sql.includes('LIMIT 1')) {
            return [{
              values: (globalThis as any).partRows || []
            }];
          }
          return [];
        }),
        prepare: vi.fn((sql: string) => {
          const boundParams: any[] = [];
          let preparedResult: any = null;
          
          return {
            bind: (params: any[]) => {
              boundParams.length = 0;
              boundParams.push(...params);
              const sessionId = params[0];
              const parts = (globalThis as any).activityParts || {};
              preparedResult = parts[sessionId] || null;
              return true;
            },
            step: () => {
              return preparedResult !== null;
            },
            get: () => {
              if (!preparedResult) return null;
              return [preparedResult.data, preparedResult.time_updated];
            },
            free: vi.fn(),
          };
        }),
        close: vi.fn(),
      };
    }),
  })),
}));

describe('OpenCodeAdapter — session list', () => {
  let adapter: OpenCodeAdapter;
  let sessionLists: SessionListItem[][];

  beforeEach(() => {
    vi.useFakeTimers();
    adapter = new OpenCodeAdapter('/fake/opencode.db');
    sessionLists = [];
    adapter.on('sessionListUpdate', (s: SessionListItem[]) => sessionLists.push(s));
    (globalThis as any).sessionRows = [];
    (globalThis as any).activityParts = {};
    (globalThis as any).preparedResult = null;
  });

  afterEach(() => {
    adapter.stop();
    vi.useRealTimers();
  });

  it('emits session list with all top-level sessions', async () => {
    (globalThis as any).sessionRows = [
      ['ses_1', 'Session A', '/projects/app-a', 'proj_1', 1000, 2000],
      ['ses_2', 'Session B', '/projects/app-b', 'proj_2', 1000, 1500],
    ];
    await adapter.start({ projectDir: '/irrelevant' });

    expect(sessionLists).toHaveLength(1);
    expect(sessionLists[0]).toHaveLength(2);
    expect(sessionLists[0][0].sessionId).toBe('ses_1');
    expect(sessionLists[0][0].projectName).toBe('app-a');
    expect(sessionLists[0][1].projectName).toBe('app-b');
  });

  it('detects busy status from step-start part', async () => {
    const now = Date.now();
    (globalThis as any).sessionRows = [['ses_1', 'Test', '/projects/app', 'p1', 1000, now]];
    (globalThis as any).activityParts = {
      'ses_1': { data: JSON.stringify({ type: 'step-start' }), time_updated: now }
    };
    await adapter.start({ projectDir: '/irrelevant' });

    expect(sessionLists[0][0].status).toBe('busy');
  });

  it('detects waiting status from recent step-finish stop', async () => {
    vi.useRealTimers(); // Need real timers for Date.now() comparison
    const now = Date.now();
    (globalThis as any).sessionRows = [['ses_1', 'Test', '/projects/app', 'p1', 1000, now]];
    (globalThis as any).activityParts = {
      'ses_1': { data: JSON.stringify({ type: 'step-finish', reason: 'stop' }), time_updated: now }
    };
    await adapter.start({ projectDir: '/irrelevant' });

    expect(sessionLists[0][0].status).toBe('waiting');
    vi.useFakeTimers();
  });

  it('detects stale status from old step-finish stop', async () => {
    const old = Date.now() - 15 * 60 * 1000; // 15 min ago
    (globalThis as any).sessionRows = [['ses_1', 'Test', '/projects/app', 'p1', 1000, old]];
    (globalThis as any).activityParts = {
      'ses_1': { data: JSON.stringify({ type: 'step-finish', reason: 'stop' }), time_updated: old }
    };
    await adapter.start({ projectDir: '/irrelevant' });

    expect(sessionLists[0][0].status).toBe('stale');
  });

  it('detects busy status from step-finish tool-calls', async () => {
    const now = Date.now();
    (globalThis as any).sessionRows = [['ses_1', 'Test', '/projects/app', 'p1', 1000, now]];
    (globalThis as any).activityParts = {
      'ses_1': { data: JSON.stringify({ type: 'step-finish', reason: 'tool-calls' }), time_updated: now }
    };
    await adapter.start({ projectDir: '/irrelevant' });

    expect(sessionLists[0][0].status).toBe('busy');
  });
});
