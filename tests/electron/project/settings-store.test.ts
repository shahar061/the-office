import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { SettingsStore } from '../../../electron/project/settings-store';

describe('SettingsStore', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-store-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeProjectManagerStub(projects: Array<{ path: string; gitIdentityId?: string | null }> = []) {
    return {
      getRecentProjects: () => projects.map((p) => ({ name: 'x', path: p.path, lastPhase: null, lastOpened: 0 })),
      getProjectState: (projectPath: string) => {
        const match = projects.find((p) => p.path === projectPath);
        return { name: 'x', path: projectPath, currentPhase: 'idle', completedPhases: [], interrupted: false, introSeen: true, gitIdentityId: match?.gitIdentityId ?? null };
      },
    } as any;
  }

  it('returns defaults on first load', () => {
    const store = new SettingsStore(tmpDir, makeProjectManagerStub());
    const settings = store.get();
    expect(settings.defaultModelPreset).toBe('default');
    expect(settings.defaultPermissionMode).toBe('auto-safe');
    expect(settings.maxParallelTLs).toBe(4);
    expect(settings.gitIdentities).toEqual([]);
    expect(settings.defaultGitIdentityId).toBeNull();
  });

  it('persists updates to disk', () => {
    const store = new SettingsStore(tmpDir, makeProjectManagerStub());
    store.update({ maxParallelTLs: 7 });
    const store2 = new SettingsStore(tmpDir, makeProjectManagerStub());
    expect(store2.get().maxParallelTLs).toBe(7);
  });

  it('recovers from corrupted JSON with defaults', () => {
    const filePath = path.join(tmpDir, 'settings.json');
    fs.writeFileSync(filePath, 'not valid json', 'utf-8');
    const store = new SettingsStore(tmpDir, makeProjectManagerStub());
    expect(store.get().maxParallelTLs).toBe(4);
  });

  it('addIdentity generates an id and persists', () => {
    const store = new SettingsStore(tmpDir, makeProjectManagerStub());
    const id = store.addIdentity({ label: 'Work', name: 'Jane', email: 'jane@acme.com' });
    expect(id.id).toBeTruthy();
    expect(store.get().gitIdentities).toHaveLength(1);
  });

  it('updateIdentity with unknown id returns null', () => {
    const store = new SettingsStore(tmpDir, makeProjectManagerStub());
    const result = store.updateIdentity('bogus', { label: 'X' });
    expect(result).toBeNull();
  });

  it('updateIdentity with valid id patches and persists', () => {
    const store = new SettingsStore(tmpDir, makeProjectManagerStub());
    const created = store.addIdentity({ label: 'Work', name: 'Jane', email: 'jane@acme.com' });
    const updated = store.updateIdentity(created.id, { label: 'Work (Acme)' });
    expect(updated?.label).toBe('Work (Acme)');
    expect(store.get().gitIdentities[0].label).toBe('Work (Acme)');
  });

  it('deleteIdentity counts affected projects', () => {
    const store = new SettingsStore(
      tmpDir,
      makeProjectManagerStub([
        { path: '/p1', gitIdentityId: 'id-1' },
        { path: '/p2', gitIdentityId: 'id-1' },
        { path: '/p3', gitIdentityId: 'id-2' },
      ]),
    );
    const created = store.addIdentity({ label: 'Work', name: 'J', email: 'j@x.com' });
    // Manually override id for deterministic test
    store.update({ gitIdentities: [{ ...created, id: 'id-1' }] });
    const result = store.deleteIdentity('id-1');
    expect(result.ok).toBe(true);
    expect(result.affectedProjects).toBe(2);
    expect(store.get().gitIdentities).toHaveLength(0);
  });

  it('deleteIdentity clears defaultGitIdentityId if it matches', () => {
    const store = new SettingsStore(tmpDir, makeProjectManagerStub());
    const created = store.addIdentity({ label: 'Work', name: 'J', email: 'j@x.com' });
    store.setDefaultIdentity(created.id);
    store.deleteIdentity(created.id);
    expect(store.get().defaultGitIdentityId).toBeNull();
  });

  it('setDefaultIdentity with unknown id is a no-op (returns silently)', () => {
    const store = new SettingsStore(tmpDir, makeProjectManagerStub());
    store.setDefaultIdentity('bogus');
    expect(store.get().defaultGitIdentityId).toBeNull();
  });

  it('resolveIdentityForProject returns per-project override when valid', () => {
    const store = new SettingsStore(tmpDir, makeProjectManagerStub());
    const work = store.addIdentity({ label: 'Work', name: 'J', email: 'j@acme.com' });
    const personal = store.addIdentity({ label: 'Personal', name: 'J', email: 'j@gmail.com' });
    store.setDefaultIdentity(work.id);
    const result = store.resolveIdentityForProject({ gitIdentityId: personal.id });
    expect(result?.id).toBe(personal.id);
  });

  it('resolveIdentityForProject falls back to default when per-project is null', () => {
    const store = new SettingsStore(tmpDir, makeProjectManagerStub());
    const work = store.addIdentity({ label: 'Work', name: 'J', email: 'j@acme.com' });
    store.setDefaultIdentity(work.id);
    const result = store.resolveIdentityForProject({ gitIdentityId: null });
    expect(result?.id).toBe(work.id);
  });

  it('resolveIdentityForProject returns null when neither per-project nor default is set', () => {
    const store = new SettingsStore(tmpDir, makeProjectManagerStub());
    const result = store.resolveIdentityForProject({ gitIdentityId: null });
    expect(result).toBeNull();
  });

  it('resolveIdentityForProject falls through to default when per-project id is stale', () => {
    const store = new SettingsStore(tmpDir, makeProjectManagerStub());
    const work = store.addIdentity({ label: 'Work', name: 'J', email: 'j@acme.com' });
    store.setDefaultIdentity(work.id);
    const result = store.resolveIdentityForProject({ gitIdentityId: 'nonexistent-id' });
    expect(result?.id).toBe(work.id);
  });
});
