import fs from 'fs';
import path from 'path';
import type { ProjectState } from '../../shared/types';
import { GitManager } from './git-manager';
import { buildGitEnv, writeRepoIdentity } from './git-identity-apply';
import type { SettingsStore } from './settings-store';
import type { ProjectManager } from './project-manager';

export interface GreenfieldGitNote {
  level: 'info' | 'warning';
  message: string;
}

type IterationFailReason = 'dirty-tree' | 'no-target-commit' | 'git-error';

export type StartIterationResult =
  | { ok: true; iterationBranch: string }
  | { ok: false; reason: IterationFailReason; message: string };

/**
 * Manages git lifecycle for greenfield projects: init on creation,
 * commit on phase end, iteration branches on RESTART_PHASE.
 * Reuses GitManager + buildGitEnv + writeRepoIdentity from sub-project 4.
 */
export class GreenfieldGit {
  private commitMutex: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly projectDir: string,
    private readonly projectManager: ProjectManager,
    private readonly settingsStore: SettingsStore,
    private readonly emitNote: (note: GreenfieldGitNote) => void,
  ) {}

  async initializeOnCreation(): Promise<void> {
    const state = this.projectManager.getProjectState(this.projectDir);
    if (state.greenfieldGit?.initialized) return; // idempotent

    const gitManager = new GitManager(this.projectDir);

    // 1. Check git binary
    if (!(await gitManager.isGitAvailable())) {
      this.setGreenfieldGitState({
        initialized: false,
        deferred: true,
        includeOfficeState: false,
        lastIterationN: 0,
      });
      this.emitNote({
        level: 'warning',
        message: 'git not found on your system — project will not be version-controlled',
      });
      return;
    }

    // 2. Resolve identity
    const identity = this.settingsStore.resolveIdentityForProject(state);
    if (!identity) {
      this.setGreenfieldGitState({
        initialized: false,
        deferred: true,
        includeOfficeState: false,
        lastIterationN: 0,
      });
      // No emitNote here — the renderer banner handles the no-identity case
      return;
    }

    // 3. git init
    try {
      await gitManager.init();
    } catch (err: any) {
      this.emitNote({
        level: 'warning',
        message: `git init failed: ${err?.message ?? err}`,
      });
      this.setGreenfieldGitState({
        initialized: false,
        deferred: true,
        includeOfficeState: false,
        lastIterationN: 0,
      });
      return;
    }

    // 4. writeRepoIdentity (best-effort)
    const git = gitManager.getSimpleGitInstance();
    await writeRepoIdentity(git, identity).catch(() => {});

    // 5. Capture includeOfficeState from global settings and write .gitignore
    const includeOfficeState =
      this.settingsStore.get().gitPreferences?.includeOfficeStateInRepo ?? false;
    this.writeGitignore(includeOfficeState);

    // 6. Commit .gitignore as the initial commit
    try {
      const env = buildGitEnv(identity);
      const gitWithEnv = Object.keys(env).length > 0 ? git.env(env) : git;
      await gitWithEnv.raw(['add', '.gitignore']);
      await gitWithEnv.commit('Initial commit (The Office)');
    } catch (err: any) {
      this.emitNote({
        level: 'warning',
        message: `initial commit failed: ${err?.message ?? err}`,
      });
      return;
    }

    // 7. Persist greenfieldGit state
    this.setGreenfieldGitState({
      initialized: true,
      deferred: false,
      includeOfficeState,
      lastIterationN: 0,
    });
    this.emitNote({ level: 'info', message: 'Project initialized with git.' });
  }

  private setGreenfieldGitState(
    greenfieldGit: NonNullable<ProjectState['greenfieldGit']>,
  ): void {
    this.projectManager.updateProjectState(this.projectDir, { greenfieldGit });
  }

  private writeGitignore(includeOfficeState: boolean): void {
    const lines: string[] = [];
    if (!includeOfficeState) {
      lines.push('.the-office/');
    }
    // Add trailing newline so the file is POSIX-compliant
    const content = lines.length > 0 ? lines.join('\n') + '\n' : '\n';
    fs.writeFileSync(path.join(this.projectDir, '.gitignore'), content, 'utf-8');
  }

  // commitPhase and startIteration added in Tasks 6 and 7
}
