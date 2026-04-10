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
