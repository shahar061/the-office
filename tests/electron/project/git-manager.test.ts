import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { GitManager } from '../../../electron/project/git-manager';

describe('GitManager — preconditions', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-manager-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('isGitAvailable returns true when git is installed', async () => {
    const gm = new GitManager(tmpDir);
    expect(await gm.isGitAvailable()).toBe(true);
  });

  it('isGitRepo returns false for an un-initialized directory', async () => {
    const gm = new GitManager(tmpDir);
    expect(await gm.isGitRepo()).toBe(false);
  });

  it('init creates a git repo', async () => {
    const gm = new GitManager(tmpDir);
    await gm.init();
    expect(await gm.isGitRepo()).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.git'))).toBe(true);
  });

  it('currentBranch returns the branch name after init and first commit', async () => {
    const gm = new GitManager(tmpDir);
    await gm.init();
    // Create an initial commit so a branch actually exists
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# test');
    const { simpleGit } = await import('simple-git');
    const g = simpleGit(tmpDir);
    await g.addConfig('user.email', 'test@example.com');
    await g.addConfig('user.name', 'Test');
    await g.add('.');
    await g.commit('initial');
    const branch = await gm.currentBranch();
    expect(branch).toBeTruthy();
    expect(typeof branch).toBe('string');
  });

  it('isDirty returns false on a fresh repo with committed state', async () => {
    const gm = new GitManager(tmpDir);
    await gm.init();
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# test');
    const { simpleGit } = await import('simple-git');
    const g = simpleGit(tmpDir);
    await g.addConfig('user.email', 'test@example.com');
    await g.addConfig('user.name', 'Test');
    await g.add('.');
    await g.commit('initial');
    expect(await gm.isDirty()).toBe(false);
  });

  it('isDirty returns true with uncommitted changes', async () => {
    const gm = new GitManager(tmpDir);
    await gm.init();
    fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'hello');
    expect(await gm.isDirty()).toBe(true);
  });

  it('isDetached returns false on a named branch', async () => {
    const gm = new GitManager(tmpDir);
    await gm.init();
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# test');
    const { simpleGit } = await import('simple-git');
    const g = simpleGit(tmpDir);
    await g.addConfig('user.email', 'test@example.com');
    await g.addConfig('user.name', 'Test');
    await g.add('.');
    await g.commit('initial');
    expect(await gm.isDetached()).toBe(false);
  });

  it('isDetached returns true in detached HEAD state', async () => {
    const gm = new GitManager(tmpDir);
    await gm.init();
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# test');
    const { simpleGit } = await import('simple-git');
    const g = simpleGit(tmpDir);
    await g.addConfig('user.email', 'test@example.com');
    await g.addConfig('user.name', 'Test');
    await g.add('.');
    await g.commit('initial');
    const log = await g.log();
    // Checkout the commit directly to enter detached HEAD
    await g.checkout(log.latest!.hash);
    expect(await gm.isDetached()).toBe(true);
  });
});
