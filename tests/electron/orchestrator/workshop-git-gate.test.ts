import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { simpleGit } from 'simple-git';
import { GitManager } from '../../../electron/project/git-manager';
import { enterGitGate, type GitGateContext } from '../../../electron/orchestrator/workshop-git-gate';
import type { Request } from '../../../shared/types';

function makeRequest(partial: Partial<Request> = {}): Request {
  return {
    id: 'req-001',
    title: 'Add dark mode',
    description: 'desc',
    status: 'in_progress',
    createdAt: 1,
    startedAt: 2,
    completedAt: null,
    assignedAgent: 'backend-engineer',
    result: null,
    error: null,
    plan: null,
    branchName: null,
    baseBranch: null,
    commitSha: null,
    branchIsolated: false,
    ...partial,
  };
}

async function setupRepo(tmpDir: string): Promise<void> {
  const g = simpleGit(tmpDir);
  await g.init();
  await g.addConfig('user.email', 'test@example.com');
  await g.addConfig('user.name', 'Test');
  await g.raw(['checkout', '-b', 'main']);
  fs.writeFileSync(path.join(tmpDir, 'README.md'), '# test');
  await g.add('.');
  await g.commit('initial');
}

describe('enterGitGate', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-gate-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function ctx(overrides: Partial<GitGateContext> = {}): GitGateContext {
    return {
      git: new GitManager(tmpDir),
      projectDir: tmpDir,
      gitInitChoice: 'yes',
      promptGitInit: async () => 'yes',
      ...overrides,
    };
  }

  it('returns isolated=false when not a git repo and user previously declined', async () => {
    const result = await enterGitGate(makeRequest(), ctx({ gitInitChoice: 'no' }));
    expect(result.isolated).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('prompts for init when gitInitChoice is null and honors yes', async () => {
    let prompted = false;
    const result = await enterGitGate(
      makeRequest(),
      ctx({
        gitInitChoice: null,
        promptGitInit: async () => {
          prompted = true;
          return 'yes';
        },
      }),
    );
    expect(prompted).toBe(true);
    expect(result.isolated).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.git'))).toBe(true);
  });

  it('prompts for init when gitInitChoice is null and honors no', async () => {
    const result = await enterGitGate(
      makeRequest(),
      ctx({
        gitInitChoice: null,
        promptGitInit: async () => 'no',
      }),
    );
    expect(result.isolated).toBe(false);
  });

  it('returns isolated=false on detached HEAD', async () => {
    await setupRepo(tmpDir);
    const g = simpleGit(tmpDir);
    const log = await g.log();
    await g.checkout(log.latest!.hash);
    const result = await enterGitGate(makeRequest(), ctx());
    expect(result.isolated).toBe(false);
    expect(result.reason).toMatch(/detached/i);
  });

  it('creates branch and captures baseBranch on a clean tree', async () => {
    await setupRepo(tmpDir);
    const result = await enterGitGate(
      makeRequest({ id: 'req-001', title: 'Add Dark Mode' }),
      ctx(),
    );
    expect(result.isolated).toBe(true);
    expect(result.baseBranch).toBe('main');
    expect(result.branchName).toBe('the-office/req-001-add-dark-mode');
    expect(result.stashCreated).toBe(false);
    const g = simpleGit(tmpDir);
    const status = await g.status();
    expect(status.current).toBe('the-office/req-001-add-dark-mode');
  });

  it('stashes dirty tree before creating the branch', async () => {
    await setupRepo(tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'scratch.txt'), 'wip');
    const result = await enterGitGate(
      makeRequest({ id: 'req-002', title: 'Do Thing' }),
      ctx(),
    );
    expect(result.isolated).toBe(true);
    expect(result.stashCreated).toBe(true);
    expect(result.stashLabel).toContain('req-002');
    // New branch tree should be clean (stash hid the scratch file)
    const g = simpleGit(tmpDir);
    const status = await g.status();
    expect(status.isClean()).toBe(true);
  });

  it('falls back to next branch name on collision', async () => {
    await setupRepo(tmpDir);
    // Pre-create the target branch
    const g = simpleGit(tmpDir);
    await g.raw(['branch', 'the-office/req-001-add-dark-mode']);
    const result = await enterGitGate(
      makeRequest({ id: 'req-001', title: 'Add Dark Mode' }),
      ctx(),
    );
    expect(result.isolated).toBe(true);
    expect(result.branchName).toBe('the-office/req-001-add-dark-mode-2');
  });
});
