import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { simpleGit, type SimpleGit } from 'simple-git';
import { acceptRequest, rejectRequest } from '../../../electron/project/git-merge';

async function setupRepoWithRequestBranch(tmpDir: string): Promise<{ g: SimpleGit; branchName: string; baseBranch: string }> {
  const g = simpleGit(tmpDir);
  await g.init();
  await g.addConfig('user.email', 'test@example.com');
  await g.addConfig('user.name', 'Test');
  await g.raw(['checkout', '-b', 'main']);
  fs.writeFileSync(path.join(tmpDir, 'README.md'), '# test\n');
  await g.add('.');
  await g.commit('initial');

  await g.raw(['checkout', '-b', 'the-office/req-001-test']);
  fs.writeFileSync(path.join(tmpDir, 'feature.ts'), 'export const x = 1;\n');
  await g.add('.');
  await g.commit('req-001: Test');
  // Back to main so we're not on the request branch
  await g.raw(['checkout', 'main']);

  return { g, branchName: 'the-office/req-001-test', baseBranch: 'main' };
}

describe('acceptRequest', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-merge-accept-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('fast-forwards a clean merge and deletes the branch', async () => {
    const { g, branchName, baseBranch } = await setupRepoWithRequestBranch(tmpDir);
    const result = await acceptRequest(g, { branchName, baseBranch });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.mergedAt).toBe('number');
    }

    const branches = await g.branch();
    expect(branches.all).not.toContain(branchName);

    const status = await g.status();
    expect(status.current).toBe('main');

    expect(fs.existsSync(path.join(tmpDir, 'feature.ts'))).toBe(true);
  });

  it('creates a merge commit when base has diverged', async () => {
    const { g, branchName, baseBranch } = await setupRepoWithRequestBranch(tmpDir);

    fs.writeFileSync(path.join(tmpDir, 'main-change.ts'), 'export const m = 1;\n');
    await g.add('.');
    await g.commit('main divergence');

    const result = await acceptRequest(g, { branchName, baseBranch });
    expect(result.ok).toBe(true);

    expect(fs.existsSync(path.join(tmpDir, 'feature.ts'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'main-change.ts'))).toBe(true);

    const branches = await g.branch();
    expect(branches.all).not.toContain(branchName);
  });

  it('returns conflict=true on merge conflict, restores original state', async () => {
    const { g } = await setupRepoWithRequestBranch(tmpDir);
    // Create a branch that edits the same file as main will edit
    await g.raw(['checkout', 'main']);
    fs.writeFileSync(path.join(tmpDir, 'shared.txt'), 'base\n');
    await g.add('.');
    await g.commit('add shared');

    await g.raw(['checkout', '-b', 'the-office/req-002-conflict']);
    fs.writeFileSync(path.join(tmpDir, 'shared.txt'), 'branch version\n');
    await g.add('.');
    await g.commit('req-002: conflict');

    await g.raw(['checkout', 'main']);
    fs.writeFileSync(path.join(tmpDir, 'shared.txt'), 'main version\n');
    await g.add('.');
    await g.commit('main version');

    const result = await acceptRequest(g, {
      branchName: 'the-office/req-002-conflict',
      baseBranch: 'main',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.conflict).toBe(true);
    }

    // Repo should be clean (merge aborted)
    const status = await g.status();
    expect(status.isClean()).toBe(true);
    expect(status.current).toBe('main');

    // Request branch should still exist
    const branches = await g.branch();
    expect(branches.all).toContain('the-office/req-002-conflict');
  });

  it('returns to the original branch on conflict even if it was not baseBranch', async () => {
    const { g } = await setupRepoWithRequestBranch(tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'shared.txt'), 'base\n');
    await g.add('.');
    await g.commit('add shared');

    await g.raw(['checkout', '-b', 'the-office/req-003-conflict']);
    fs.writeFileSync(path.join(tmpDir, 'shared.txt'), 'branch v\n');
    await g.add('.');
    await g.commit('req-003');

    await g.raw(['checkout', 'main']);
    fs.writeFileSync(path.join(tmpDir, 'shared.txt'), 'main v\n');
    await g.add('.');
    await g.commit('main v');

    // Put the user on a third branch before accepting
    await g.raw(['checkout', '-b', 'user-branch']);

    const result = await acceptRequest(g, {
      branchName: 'the-office/req-003-conflict',
      baseBranch: 'main',
    });

    expect(result.ok).toBe(false);
    const status = await g.status();
    // Should be back on user-branch, not main
    expect(status.current).toBe('user-branch');
    expect(status.isClean()).toBe(true);
  });
});

describe('rejectRequest', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-merge-reject-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('deletes the branch from baseBranch', async () => {
    const { g, branchName, baseBranch } = await setupRepoWithRequestBranch(tmpDir);
    const result = await rejectRequest(g, { branchName, baseBranch });
    expect(result.ok).toBe(true);
    const branches = await g.branch();
    expect(branches.all).not.toContain(branchName);
  });

  it('switches away from target branch before deleting if currently on it', async () => {
    const { g, branchName, baseBranch } = await setupRepoWithRequestBranch(tmpDir);
    await g.raw(['checkout', branchName]);

    const result = await rejectRequest(g, { branchName, baseBranch });
    expect(result.ok).toBe(true);

    const status = await g.status();
    expect(status.current).toBe('main');

    const branches = await g.branch();
    expect(branches.all).not.toContain(branchName);
  });

  it('returns error if branch does not exist', async () => {
    const { g } = await setupRepoWithRequestBranch(tmpDir);
    const result = await rejectRequest(g, {
      branchName: 'the-office/nonexistent',
      baseBranch: 'main',
    });
    expect(result.ok).toBe(false);
  });
});
