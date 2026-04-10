import type { Request } from '../../shared/types';
import { GitManager } from '../project/git-manager';
import { slugifyTitle } from '../project/slugify';

export interface GitGateContext {
  git: GitManager;
  projectDir: string;
  gitInitChoice: 'yes' | 'no' | null;
  /** Wired to IPC modal. Called at most once per project when gitInitChoice is null. */
  promptGitInit: () => Promise<'yes' | 'no'>;
}

export interface EnterResult {
  isolated: boolean;
  reason?: string;
  baseBranch?: string;
  branchName?: string;
  stashCreated?: boolean;
  stashLabel?: string;
}

export interface ExitResult {
  commitSha: string | null;
  restoreWarning: string | null;
}

export async function enterGitGate(
  request: Request,
  ctx: GitGateContext,
): Promise<EnterResult> {
  // 1. git binary available?
  if (!(await ctx.git.isGitAvailable())) {
    return { isolated: false, reason: 'git binary not found on system' };
  }

  // 2. Is it a git repo? If not, handle init choice.
  let isRepo = await ctx.git.isGitRepo();
  if (!isRepo) {
    let choice = ctx.gitInitChoice;
    if (choice === null) {
      choice = await ctx.promptGitInit();
    }
    if (choice === 'no') {
      return { isolated: false, reason: 'git init declined by user' };
    }
    // Initialize and create an empty initial commit so HEAD exists
    try {
      await ctx.git.init();
      await ctx.git.createInitialEmptyCommit();
      isRepo = true;
    } catch (err: any) {
      return { isolated: false, reason: `git init failed: ${err?.message || err}` };
    }
  }

  // 3. Detached HEAD?
  if (await ctx.git.isDetached()) {
    return { isolated: false, reason: 'detached HEAD — check out a branch before submitting requests' };
  }

  // 4. Capture base branch
  const baseBranch = await ctx.git.currentBranch();
  if (!baseBranch) {
    return { isolated: false, reason: 'could not determine current branch' };
  }

  // 5. Stash dirty state (if any)
  const stashLabel = `the-office: ${request.id} base-stash`;
  const stashResult = await ctx.git.stashPushAll(stashLabel);

  // 6. Create branch with collision handling
  const slug = slugifyTitle(request.title);
  const baseName = `the-office/${request.id}-${slug}`;
  let branchName = baseName;
  let suffix = 2;
  while (await ctx.git.branchExists(branchName)) {
    branchName = `${baseName}-${suffix}`;
    suffix++;
  }

  try {
    await ctx.git.checkoutNewBranch(branchName);
  } catch (err: any) {
    // Try to restore the stash if we created one
    if (stashResult.created) {
      await ctx.git.stashPopIfOwned('the-office:').catch(() => {});
    }
    return { isolated: false, reason: `branch creation failed: ${err?.message || err}` };
  }

  return {
    isolated: true,
    baseBranch,
    branchName,
    stashCreated: stashResult.created,
    stashLabel: stashResult.created ? stashLabel : undefined,
  };
}

export async function exitGitGate(
  request: Request,
  ctx: GitGateContext,
  outcome: 'success' | 'failure',
  stashLabel: string,
): Promise<ExitResult> {
  let commitSha: string | null = null;
  let restoreWarning: string | null = null;

  // 1. Commit on the branch
  try {
    if (outcome === 'success') {
      const message = `${request.id}: ${request.title}`;
      const sha = await ctx.git.commitAll(message);
      commitSha = sha || null;
    } else {
      // Failure: if dirty, preserve partial work under a FAILED commit
      if (await ctx.git.hasUncommittedChanges()) {
        const message = `${request.id}: FAILED — partial work`;
        const sha = await ctx.git.commitAll(message);
        commitSha = sha || null;
      }
    }
  } catch (err: any) {
    restoreWarning = `Commit step failed: ${err?.message || err}`;
  }

  // 2. Checkout base branch (if we know it and we're not already there)
  if (request.baseBranch) {
    try {
      const current = await ctx.git.currentBranch();
      if (current !== request.baseBranch) {
        await ctx.git.checkoutExistingBranch(request.baseBranch);
      }
    } catch (err: any) {
      restoreWarning =
        (restoreWarning ? restoreWarning + '\n' : '') +
        `Could not checkout ${request.baseBranch}: ${err?.message || err}`;
    }
  }

  // 3. Pop stash if we created one
  if (stashLabel) {
    const popResult = await ctx.git.stashPopIfOwned('the-office:');
    if (!popResult.ok) {
      restoreWarning =
        (restoreWarning ? restoreWarning + '\n' : '') +
        'Your stashed work could not be restored automatically. Run `git stash pop` manually to recover it.';
    }
  }

  return { commitSha, restoreWarning };
}
