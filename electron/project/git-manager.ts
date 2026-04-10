import fs from 'fs';
import path from 'path';
import { simpleGit, SimpleGit } from 'simple-git';

export class GitManager {
  private projectDir: string;
  private git: SimpleGit;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
    this.git = simpleGit(projectDir);
  }

  getSimpleGitInstance(): SimpleGit {
    return this.git;
  }

  async isGitAvailable(): Promise<boolean> {
    try {
      await this.git.raw(['--version']);
      return true;
    } catch {
      return false;
    }
  }

  async isGitRepo(): Promise<boolean> {
    try {
      if (!fs.existsSync(path.join(this.projectDir, '.git'))) return false;
      await this.git.raw(['rev-parse', '--git-dir']);
      return true;
    } catch {
      return false;
    }
  }

  async init(): Promise<void> {
    await this.git.init();
  }

  /**
   * Create an empty initial commit. Used after `init()` to ensure the repo
   * has a HEAD and a named branch. Safe to call on an empty repo.
   * If identity is provided, sets local user.name/email to that before committing.
   */
  async createInitialEmptyCommit(identity?: { name: string; email: string }): Promise<void> {
    const name = identity?.name ?? 'The Office';
    const email = identity?.email ?? 'the-office@local';
    await this.git.addConfig('user.email', email, false, 'local');
    await this.git.addConfig('user.name', name, false, 'local');
    await this.git
      .env({
        ...process.env,
        GIT_AUTHOR_NAME: name,
        GIT_AUTHOR_EMAIL: email,
        GIT_COMMITTER_NAME: name,
        GIT_COMMITTER_EMAIL: email,
      })
      .raw(['commit', '--allow-empty', '-m', 'Initial commit (by The Office)']);
  }

  async currentBranch(): Promise<string | null> {
    try {
      const result = await this.git.raw(['rev-parse', '--abbrev-ref', 'HEAD']);
      const branch = result.trim();
      if (branch === 'HEAD') return null; // detached
      return branch;
    } catch {
      return null;
    }
  }

  async isDirty(): Promise<boolean> {
    const status = await this.git.status();
    return !status.isClean();
  }

  async isDetached(): Promise<boolean> {
    const branch = await this.currentBranch();
    return branch === null;
  }

  async stashPushAll(label: string): Promise<{ created: boolean }> {
    if (!(await this.isDirty())) {
      return { created: false };
    }
    await this.git.raw(['stash', 'push', '-u', '-m', label]);
    return { created: true };
  }

  async stashPopIfOwned(
    labelPrefix: string,
  ): Promise<{ ok: true; popped: boolean } | { ok: false; conflict: true; reason: string }> {
    let list = '';
    try {
      list = await this.git.raw(['stash', 'list']);
    } catch {
      return { ok: true, popped: false };
    }
    const firstLine = list.split('\n')[0] ?? '';
    if (!firstLine.trim()) {
      return { ok: true, popped: false };
    }
    // Format: stash@{0}: On branch-name: <label>
    // We only pop if the message (everything after the second ':') starts with labelPrefix
    const idx = firstLine.indexOf(': ');
    if (idx === -1) return { ok: true, popped: false };
    const afterFirstColon = firstLine.slice(idx + 2);
    const idx2 = afterFirstColon.indexOf(': ');
    const message = idx2 === -1 ? afterFirstColon : afterFirstColon.slice(idx2 + 2);
    if (!message.startsWith(labelPrefix)) {
      return { ok: true, popped: false };
    }
    try {
      const output = await this.git.raw(['stash', 'pop']);
      // simple-git does not throw on stash pop conflicts; detect via output
      if (output.includes('CONFLICT') || output.includes('could not restore')) {
        return { ok: false, conflict: true, reason: output.trim() };
      }
      return { ok: true, popped: true };
    } catch (err: any) {
      return { ok: false, conflict: true, reason: err?.message || String(err) };
    }
  }

  async checkoutNewBranch(name: string): Promise<void> {
    await this.git.raw(['checkout', '-b', name]);
  }

  async checkoutExistingBranch(name: string): Promise<void> {
    await this.git.raw(['checkout', name]);
  }

  async branchExists(name: string): Promise<boolean> {
    try {
      const result = await this.git.raw(['rev-parse', '--verify', '--quiet', `refs/heads/${name}`]);
      return result.trim().length > 0;
    } catch {
      return false;
    }
  }

  async commitAll(message: string, envOverride?: Record<string, string>): Promise<string> {
    if (!(await this.isDirty())) return '';
    await this.git.add('.');
    const gitForCommit =
      envOverride && Object.keys(envOverride).length > 0
        ? this.git.env(envOverride)
        : this.git;
    const result = await gitForCommit.commit(message);
    return result.commit || '';
  }

  async hasUncommittedChanges(): Promise<boolean> {
    return this.isDirty();
  }
}
