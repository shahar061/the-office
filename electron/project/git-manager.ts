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
}
