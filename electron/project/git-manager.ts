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
   */
  async createInitialEmptyCommit(): Promise<void> {
    await this.git.addConfig('user.email', 'the-office@local', false, 'local');
    await this.git.addConfig('user.name', 'The Office', false, 'local');
    await this.git.raw(['commit', '--allow-empty', '-m', 'Initial commit (by The Office)']);
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
      await this.git.raw(['stash', 'pop']);
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

  async commitAll(message: string): Promise<string> {
    if (!(await this.isDirty())) return '';
    await this.git.add('.');
    const result = await this.git.commit(message);
    return result.commit || '';
  }

  async hasUncommittedChanges(): Promise<boolean> {
    return this.isDirty();
  }
}
