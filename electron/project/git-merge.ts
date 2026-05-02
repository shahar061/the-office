import type { SimpleGit } from 'simple-git';
import type { GitIdentity } from '../../shared/types';
import { buildGitEnv } from './git-identity-apply';

export type AcceptResult =
  | { ok: true; mergedAt: number }
  | { ok: false; conflict: true; message: string }
  | { ok: false; conflict: false; message: string };

/**
 * Merge a request branch back into its base branch.
 * On conflict: aborts the merge cleanly and returns to the original branch.
 * On success: deletes the request branch.
 */
export async function acceptRequest(
  git: SimpleGit,
  request: { branchName: string; baseBranch: string },
  identity?: GitIdentity | null,
): Promise<AcceptResult> {
  // Capture the branch we're on BEFORE touching anything (for rollback)
  let originalBranch: string;
  try {
    const result = await git.raw(['rev-parse', '--abbrev-ref', 'HEAD']);
    originalBranch = result.trim();
  } catch (err: any) {
    return { ok: false, conflict: false, message: `Could not determine current branch: ${err?.message || err}` };
  }

  // Switch to baseBranch
  try {
    if (originalBranch !== request.baseBranch) {
      await git.raw(['checkout', request.baseBranch]);
    }
  } catch (err: any) {
    return { ok: false, conflict: false, message: `Could not checkout ${request.baseBranch}: ${err?.message || err}` };
  }

  // `.the-office/` holds the renderer's runtime state (config.json, chat
  // history, request log, pending-question.json). Workshop projects whose
  // initial commit predates the gitignore for it end up with two sources of
  // truth — the working-tree copy on `main` and the snapshot committed on
  // the request branch. The merge then aborts with one of:
  //   "Your local changes to the following files would be overwritten by
  //    merge: .the-office/config.json"
  //   "The following untracked working tree files would be overwritten by
  //    merge: .the-office/requests.json"
  // Both versions are derivable, so before merging we discard the working
  // copy: tracked office-state files get reset to HEAD, untracked ones get
  // removed. The orchestrator rewrites whatever is needed after the merge.
  try {
    await git.raw(['checkout', '--', '.the-office/']);
  } catch {
    // Nothing tracked under .the-office/ — fine.
  }
  try {
    await git.raw(['clean', '-fd', '.the-office/']);
  } catch {
    // No untracked files there — also fine.
  }

  // Attempt the merge (no --ff-only, no --no-ff — let git decide)
  // simple-git's git.raw() does NOT throw on conflict — it returns the output string.
  // We must check both for a throw (unexpected errors) and for CONFLICT in the output.
  const env = buildGitEnv(identity ?? null);
  const gitForMerge = Object.keys(env).length > 0 ? git.env(env) : git;
  let mergeOutput = '';
  let mergeError = false;
  let mergeMessage = '';
  try {
    mergeOutput = await gitForMerge.raw(['merge', request.branchName]);
  } catch (err: any) {
    mergeError = true;
    mergeMessage = err?.message || String(err);
  }

  const hasConflict = mergeError
    ? /conflict/i.test(mergeMessage)
    : /^CONFLICT/m.test(mergeOutput);

  if (mergeError || hasConflict) {
    const message = mergeError ? mergeMessage : mergeOutput;
    // Abort the merge cleanly (safe no-op if no merge in progress)
    try {
      await git.raw(['merge', '--abort']);
    } catch {
      // Ignore — --abort fails if there's no merge in progress
    }
    // Restore original branch if it wasn't baseBranch
    if (originalBranch !== request.baseBranch) {
      try {
        await git.raw(['checkout', originalBranch]);
      } catch {
        // Best-effort
      }
    }
    return { ok: false, conflict: hasConflict, message };
  }

  // Merge succeeded — delete the branch
  try {
    await git.raw(['branch', '-D', request.branchName]);
  } catch {
    // Merge succeeded but delete failed — still return success
  }

  return { ok: true, mergedAt: Date.now() };
}

/**
 * Delete a request branch. Switches away from it first if currently on it.
 */
export async function rejectRequest(
  git: SimpleGit,
  request: { branchName: string; baseBranch: string },
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const current = (await git.raw(['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
    if (current === request.branchName) {
      await git.raw(['checkout', request.baseBranch]);
    }
    await git.raw(['branch', '-D', request.branchName]);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, message: err?.message || String(err) };
  }
}
