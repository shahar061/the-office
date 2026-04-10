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

  it('getSimpleGitInstance returns a usable simple-git instance', async () => {
    const gm = new GitManager(tmpDir);
    const git = gm.getSimpleGitInstance();
    expect(git).toBeTruthy();
    await gm.init();
    const status = await git.status();
    expect(status).toBeTruthy();
  });
});

describe('GitManager — operations', () => {
  let tmpDir: string;

  // Helper to set up a repo with an initial commit on 'main'
  async function setupRepo(): Promise<GitManager> {
    const gm = new GitManager(tmpDir);
    await gm.init();
    // Force branch name to 'main' for deterministic tests
    const { simpleGit } = await import('simple-git');
    const g = simpleGit(tmpDir);
    await g.addConfig('user.email', 'test@example.com');
    await g.addConfig('user.name', 'Test');
    await g.raw(['checkout', '-b', 'main']);
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# test');
    await g.add('.');
    await g.commit('initial');
    return gm;
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-manager-ops-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('stashPushAll on a clean tree returns created=false', async () => {
    const gm = await setupRepo();
    const result = await gm.stashPushAll('the-office: test');
    expect(result.created).toBe(false);
  });

  it('stashPushAll on a dirty tree creates a stash', async () => {
    const gm = await setupRepo();
    fs.writeFileSync(path.join(tmpDir, 'scratch.txt'), 'wip');
    const result = await gm.stashPushAll('the-office: req-001 base-stash');
    expect(result.created).toBe(true);
    expect(await gm.isDirty()).toBe(false);
  });

  it('stashPopIfOwned pops a matching stash', async () => {
    const gm = await setupRepo();
    fs.writeFileSync(path.join(tmpDir, 'scratch.txt'), 'wip');
    await gm.stashPushAll('the-office: req-001 base-stash');
    const result = await gm.stashPopIfOwned('the-office:');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.popped).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'scratch.txt'))).toBe(true);
  });

  it('stashPopIfOwned leaves a mismatching top stash alone', async () => {
    const gm = await setupRepo();
    fs.writeFileSync(path.join(tmpDir, 'scratch.txt'), 'user stash');
    // Create a user stash with a different label
    const { simpleGit } = await import('simple-git');
    const g = simpleGit(tmpDir);
    await g.raw(['stash', 'push', '-u', '-m', 'user: my wip']);
    const result = await gm.stashPopIfOwned('the-office:');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.popped).toBe(false);
    // User stash should still be there
    const list = await g.raw(['stash', 'list']);
    expect(list).toContain('user: my wip');
  });

  it('stashPopIfOwned returns ok=true popped=false on empty stash', async () => {
    const gm = await setupRepo();
    const result = await gm.stashPopIfOwned('the-office:');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.popped).toBe(false);
  });

  it('checkoutNewBranch creates and switches', async () => {
    const gm = await setupRepo();
    await gm.checkoutNewBranch('the-office/req-001-test');
    expect(await gm.currentBranch()).toBe('the-office/req-001-test');
  });

  it('checkoutExistingBranch switches to a known branch', async () => {
    const gm = await setupRepo();
    await gm.checkoutNewBranch('the-office/req-001-test');
    await gm.checkoutExistingBranch('main');
    expect(await gm.currentBranch()).toBe('main');
  });

  it('branchExists true for existing branch, false for missing', async () => {
    const gm = await setupRepo();
    await gm.checkoutNewBranch('the-office/req-001-test');
    expect(await gm.branchExists('the-office/req-001-test')).toBe(true);
    expect(await gm.branchExists('does-not-exist')).toBe(false);
  });

  it('commitAll stages and commits dirty files, returns short sha', async () => {
    const gm = await setupRepo();
    fs.writeFileSync(path.join(tmpDir, 'new-file.txt'), 'data');
    const sha = await gm.commitAll('req-001: test commit');
    expect(sha).toMatch(/^[0-9a-f]{7,40}$/);
    expect(await gm.isDirty()).toBe(false);
  });

  it('commitAll on a clean tree returns empty string and does nothing', async () => {
    const gm = await setupRepo();
    const sha = await gm.commitAll('req-001: nothing');
    expect(sha).toBe('');
  });

  it('hasUncommittedChanges reflects isDirty', async () => {
    const gm = await setupRepo();
    expect(await gm.hasUncommittedChanges()).toBe(false);
    fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'data');
    expect(await gm.hasUncommittedChanges()).toBe(true);
  });

  it('createInitialEmptyCommit creates a HEAD with a real branch on a fresh repo', async () => {
    const gm = new GitManager(tmpDir);
    await gm.init();
    await gm.createInitialEmptyCommit();
    const branch = await gm.currentBranch();
    expect(branch).toBeTruthy();
    expect(typeof branch).toBe('string');
    // Should not be detached
    expect(await gm.isDetached()).toBe(false);
  });

  it('createInitialEmptyCommit uses provided identity when given', async () => {
    const gm = new GitManager(tmpDir);
    await gm.init();
    await gm.createInitialEmptyCommit({ name: 'Jane Doe', email: 'jane@acme.com' });
    const { simpleGit } = await import('simple-git');
    const g = simpleGit(tmpDir);
    const log = await g.log();
    expect(log.latest?.author_name).toBe('Jane Doe');
    expect(log.latest?.author_email).toBe('jane@acme.com');
  });

  it('commitAll applies envOverride to the commit author', async () => {
    const gm = await setupRepo();
    fs.writeFileSync(path.join(tmpDir, 'feature.ts'), 'export const x = 1;\n');
    const sha = await gm.commitAll('test commit', {
      GIT_AUTHOR_NAME: 'Override Name',
      GIT_AUTHOR_EMAIL: 'override@example.com',
      GIT_COMMITTER_NAME: 'Override Name',
      GIT_COMMITTER_EMAIL: 'override@example.com',
    });
    expect(sha).toBeTruthy();
    const { simpleGit } = await import('simple-git');
    const g = simpleGit(tmpDir);
    const log = await g.log();
    expect(log.latest?.author_name).toBe('Override Name');
    expect(log.latest?.author_email).toBe('override@example.com');
  });
});
