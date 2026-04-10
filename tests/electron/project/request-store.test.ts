import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { RequestStore } from '../../../electron/project/request-store';

describe('RequestStore', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'request-store-test-'));
    fs.mkdirSync(path.join(tmpDir, '.the-office'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('starts empty when no file exists', () => {
    const store = new RequestStore(tmpDir);
    expect(store.list()).toEqual([]);
  });

  it('creates a request with incrementing id', () => {
    const store = new RequestStore(tmpDir);
    const r1 = store.create('add dark mode');
    const r2 = store.create('fix login bug');
    expect(r1.id).toBe('req-001');
    expect(r2.id).toBe('req-002');
  });

  it('persists requests to disk', () => {
    const store = new RequestStore(tmpDir);
    store.create('add dark mode');
    const filePath = path.join(tmpDir, '.the-office', 'requests.json');
    expect(fs.existsSync(filePath)).toBe(true);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].description).toBe('add dark mode');
  });

  it('loads persisted requests on construction', () => {
    const s1 = new RequestStore(tmpDir);
    s1.create('request one');
    s1.create('request two');
    const s2 = new RequestStore(tmpDir);
    expect(s2.list()).toHaveLength(2);
  });

  it('list returns newest first', async () => {
    const store = new RequestStore(tmpDir);
    const first = store.create('first');
    await new Promise(r => setTimeout(r, 2));
    const second = store.create('second');
    const list = store.list();
    expect(list[0].id).toBe(second.id);
    expect(list[1].id).toBe(first.id);
  });

  it('update merges and persists', () => {
    const store = new RequestStore(tmpDir);
    const r = store.create('initial');
    const updated = store.update(r.id, { title: 'New Title', status: 'in_progress' });
    expect(updated?.title).toBe('New Title');
    expect(updated?.status).toBe('in_progress');
    expect(updated?.description).toBe('initial'); // preserved
  });

  it('update returns null for unknown id', () => {
    const store = new RequestStore(tmpDir);
    expect(store.update('req-999', { title: 'x' })).toBeNull();
  });

  it('get returns a request by id', () => {
    const store = new RequestStore(tmpDir);
    const r = store.create('test');
    expect(store.get(r.id)?.description).toBe('test');
    expect(store.get('req-999')).toBeNull();
  });

  it('increments ids correctly after load', () => {
    const s1 = new RequestStore(tmpDir);
    s1.create('first');
    s1.create('second');
    const s2 = new RequestStore(tmpDir);
    const third = s2.create('third');
    expect(third.id).toBe('req-003');
  });

  it('rewrites in_progress requests to failed on load (crash recovery)', () => {
    const filePath = path.join(tmpDir, '.the-office', 'requests.json');
    const stuck = [
      {
        id: 'req-001',
        title: 'Stuck',
        description: 'never finished',
        status: 'in_progress',
        createdAt: 1000,
        startedAt: 2000,
        completedAt: null,
        assignedAgent: 'backend-engineer',
        result: null,
        error: null,
      },
      {
        id: 'req-002',
        title: '',
        description: 'also stuck',
        status: 'queued',
        createdAt: 3000,
        startedAt: null,
        completedAt: null,
        assignedAgent: null,
        result: null,
        error: null,
      },
    ];
    fs.writeFileSync(filePath, JSON.stringify(stuck), 'utf-8');

    const store = new RequestStore(tmpDir);
    const list = store.list();
    const r1 = list.find(r => r.id === 'req-001')!;
    const r2 = list.find(r => r.id === 'req-002')!;
    expect(r1.status).toBe('failed');
    expect(r1.error).toBe('Interrupted by app restart');
    expect(r1.completedAt).not.toBeNull();
    expect(r2.status).toBe('failed');
    expect(r2.error).toBe('Interrupted by app restart');
  });
});
