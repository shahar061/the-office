/**
 * Parse `git log --format=%H|%s` output and return the first commit SHA
 * whose subject (message first line) starts with the given prefix.
 * Returns null if no match.
 *
 * The `%s` format is the subject line only; `|` is used as the separator
 * between SHA and subject. Subjects may themselves contain `|` characters,
 * so we split on the FIRST pipe only.
 */
export function findCommitByPrefix(log: string, prefix: string): string | null {
  for (const line of log.split('\n')) {
    if (!line.trim()) continue;
    const idx = line.indexOf('|');
    if (idx === -1) continue;
    const sha = line.slice(0, idx);
    const subject = line.slice(idx + 1);
    if (subject.startsWith(prefix)) return sha;
  }
  return null;
}
