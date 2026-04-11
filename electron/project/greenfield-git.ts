import fs from 'fs';
import path from 'path';
import type { Phase, ProjectState } from '../../shared/types';
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

  async commitPhase(phase: Phase, outcome: 'completed' | 'failed'): Promise<void> {
    return this.withMutex(async () => {
      const state = this.projectManager.getProjectState(this.projectDir);
      const gg = state.greenfieldGit;

      // If deferred, try retroactive init first
      if (gg?.deferred) {
        const didInit = await this.retroactiveInit();
        if (!didInit) return; // still no identity, skip
      }

      // Re-read state after potential retroactive init
      const latest = this.projectManager.getProjectState(this.projectDir);
      if (!latest.greenfieldGit?.initialized) return;

      // Resolve identity
      const identity = this.settingsStore.resolveIdentityForProject(latest);
      if (!identity) {
        this.emitNote({
          level: 'warning',
          message: `Cannot commit ${phase}: no git identity configured`,
        });
        return;
      }

      const gitManager = new GitManager(this.projectDir);
      const git = gitManager.getSimpleGitInstance();
      const env = buildGitEnv(identity);
      const gitWithEnv = Object.keys(env).length > 0 ? git.env(env) : git;

      // Stage everything (respects .gitignore)
      try {
        await gitWithEnv.raw(['add', '-A']);
      } catch (err: any) {
        this.emitNote({
          level: 'warning',
          message: `Failed to stage ${phase}: ${err?.message ?? err}`,
        });
        return;
      }

      // Check if anything to commit
      try {
        const status = await git.raw(['status', '--porcelain']);
        if (status.trim().length === 0) return; // nothing to commit
      } catch (err: any) {
        this.emitNote({
          level: 'warning',
          message: `git status failed for ${phase}: ${err?.message ?? err}`,
        });
        return;
      }

      const message = this.buildPhaseCommitMessage(phase, outcome);
      try {
        await gitWithEnv.commit(message);
        this.emitNote({ level: 'info', message: `Saved ${phase} phase to git.` });
      } catch (err: any) {
        this.emitNote({
          level: 'warning',
          message: `Failed to commit ${phase}: ${err?.message ?? err}`,
        });
      }
    });
  }

  /**
   * Runs on the first commitPhase call after identity is configured
   * (when `greenfieldGit.deferred === true`). Initializes the repo and
   * creates the initial .gitignore commit. The caller (commitPhase) will
   * then commit the pending phase artifacts as a separate commit.
   *
   * Returns true if init succeeded, false otherwise.
   */
  private async retroactiveInit(): Promise<boolean> {
    const state = this.projectManager.getProjectState(this.projectDir);
    const identity = this.settingsStore.resolveIdentityForProject(state);
    if (!identity) return false;

    const gitManager = new GitManager(this.projectDir);

    // Init if not already
    if (!(await gitManager.isGitRepo())) {
      try {
        await gitManager.init();
      } catch (err: any) {
        this.emitNote({
          level: 'warning',
          message: `Retroactive git init failed: ${err?.message ?? err}`,
        });
        return false;
      }
    }

    const git = gitManager.getSimpleGitInstance();
    await writeRepoIdentity(git, identity).catch(() => {});

    // Write .gitignore and create initial commit
    const includeOfficeState =
      this.settingsStore.get().gitPreferences?.includeOfficeStateInRepo ?? false;
    this.writeGitignore(includeOfficeState);

    try {
      const env = buildGitEnv(identity);
      const gitWithEnv = Object.keys(env).length > 0 ? git.env(env) : git;
      await gitWithEnv.raw(['add', '.gitignore']);
      await gitWithEnv.commit('Initial commit (The Office)');
    } catch (err: any) {
      this.emitNote({
        level: 'warning',
        message: `Retroactive initial commit failed: ${err?.message ?? err}`,
      });
      return false;
    }

    this.setGreenfieldGitState({
      initialized: true,
      deferred: false,
      includeOfficeState,
      lastIterationN: 0,
    });
    this.emitNote({ level: 'info', message: 'Project initialized with git (retroactive).' });
    return true;
  }

  private buildPhaseCommitMessage(
    phase: Phase,
    outcome: 'completed' | 'failed',
  ): string {
    if (phase === 'imagine') return 'imagine: vision brief, PRD, market analysis';
    if (phase === 'warroom') return 'warroom: system design, implementation plan';
    if (phase === 'build') {
      return outcome === 'failed'
        ? 'build: FAILED — partial work'
        : 'build: initial implementation';
    }
    if (phase === 'complete') return 'complete: RUN.md and completion summary';
    return `${phase}: update`;
  }

  /**
   * Serialize async operations so concurrent commitPhase calls don't
   * interleave and corrupt the working tree / staging area.
   */
  private withMutex<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.commitMutex.then(fn, fn);
    this.commitMutex = next.catch(() => {});
    return next;
  }

  // startIteration added in Task 7
}
