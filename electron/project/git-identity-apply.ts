import type { SimpleGit } from 'simple-git';
import type { GitIdentity } from '../../shared/types';

/**
 * Build env-var object for passing to git commit / merge commands.
 * Returns an empty object if identity is null (git falls back to its own defaults).
 */
export function buildGitEnv(identity: GitIdentity | null): Record<string, string> {
  if (!identity) return {};
  return {
    GIT_AUTHOR_NAME: identity.name,
    GIT_AUTHOR_EMAIL: identity.email,
    GIT_COMMITTER_NAME: identity.name,
    GIT_COMMITTER_EMAIL: identity.email,
  };
}

/**
 * Write identity to the repo's .git/config as user.name / user.email.
 * Best-effort: logs and swallows errors (not a git repo, permission denied, etc.).
 * No-op if identity is null.
 */
export async function writeRepoIdentity(
  git: SimpleGit,
  identity: GitIdentity | null,
): Promise<void> {
  if (!identity) return;
  try {
    await git.raw(['config', '--local', 'user.name', identity.name]);
    await git.raw(['config', '--local', 'user.email', identity.email]);
  } catch (err) {
    console.warn('[writeRepoIdentity] best-effort write failed:', err);
  }
}
