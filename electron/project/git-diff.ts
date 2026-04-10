import type { SimpleGit } from 'simple-git';
import type { DiffFile, DiffHunkLine, DiffResult } from '../../shared/types';

/**
 * Parse a unified diff text (output of `git diff`) into structured DiffFile[].
 * Best-effort: malformed input produces best-possible results without throwing.
 */
export function parseUnifiedDiff(text: string): DiffFile[] {
  if (!text.trim()) return [];

  const lines = text.split('\n');
  const files: DiffFile[] = [];
  let current: DiffFile | null = null;
  let oldLineNum = 0;
  let newLineNum = 0;

  const pushCurrent = () => {
    if (current) files.push(current);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('diff --git ')) {
      pushCurrent();
      // Extract path from "diff --git a/path b/path"
      const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      const path = match ? match[2] : '';
      current = {
        path,
        oldPath: null,
        status: 'modified',
        insertions: 0,
        deletions: 0,
        hunks: [],
        truncated: false,
      };
      continue;
    }

    if (!current) continue;

    if (line.startsWith('new file mode ')) {
      current.status = 'added';
      continue;
    }
    if (line.startsWith('deleted file mode ')) {
      current.status = 'removed';
      continue;
    }
    if (line.startsWith('rename from ')) {
      current.oldPath = line.slice('rename from '.length);
      current.status = 'renamed';
      continue;
    }
    if (line.startsWith('rename to ')) {
      current.path = line.slice('rename to '.length);
      continue;
    }
    if (line.startsWith('Binary files ')) {
      current.status = 'binary';
      current.hunks = [];
      continue;
    }
    if (line.startsWith('index ') || line.startsWith('similarity index ')) {
      continue;
    }
    if (line.startsWith('--- ') || line.startsWith('+++ ')) {
      continue;
    }

    // Hunk header: @@ -oldStart,oldCount +newStart,newCount @@
    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      oldLineNum = parseInt(hunkMatch[1], 10);
      newLineNum = parseInt(hunkMatch[2], 10);
      current.hunks.push({ type: 'meta', content: line });
      continue;
    }

    // Content lines within a hunk
    if (line.startsWith('+') && !line.startsWith('+++')) {
      current.hunks.push({
        type: 'add',
        content: line.slice(1),
        newLine: newLineNum++,
      });
      continue;
    }
    if (line.startsWith('-') && !line.startsWith('---')) {
      current.hunks.push({
        type: 'remove',
        content: line.slice(1),
        oldLine: oldLineNum++,
      });
      continue;
    }
    if (line.startsWith(' ')) {
      current.hunks.push({
        type: 'context',
        content: line.slice(1),
        oldLine: oldLineNum++,
        newLine: newLineNum++,
      });
      continue;
    }
    if (line.startsWith('\\ No newline')) {
      current.hunks.push({ type: 'meta', content: line });
      continue;
    }
    // Unrecognized line: skip silently (best-effort parsing)
  }

  pushCurrent();
  return files;
}

/**
 * Apply a per-file line cap. Files whose insertions+deletions exceed maxLines
 * have their hunks cleared and `truncated: true` set. Binary files are
 * already hunk-less and are unaffected.
 */
export function applyTruncation(files: DiffFile[], maxLines: number): DiffFile[] {
  return files.map((f) => {
    if (f.status === 'binary') return f;
    if (f.insertions + f.deletions > maxLines) {
      return { ...f, hunks: [], truncated: true };
    }
    return f;
  });
}

/**
 * Compute the diff between baseBranch and branchName using triple-dot notation.
 * Returns a structured DiffResult with per-file hunks, stats, and truncation
 * applied (per-file cap of 500 changed lines).
 */
export async function computeRequestDiff(
  git: SimpleGit,
  baseBranch: string,
  branchName: string,
): Promise<DiffResult> {
  const range = `${baseBranch}...${branchName}`;

  // 1. Stats + binary detection via numstat
  const numstatOutput = await git.raw(['diff', '--numstat', range]);
  const stats = parseNumstat(numstatOutput);

  // 2. Full text diff
  const textOutput = await git.raw(['diff', range]);

  // 3. Parse the text
  const parsedFiles = parseUnifiedDiff(textOutput);

  // 4. Merge stats into parsed files
  const merged = parsedFiles.map((f) => {
    const stat = stats.get(f.path) ?? stats.get(f.oldPath ?? '');
    if (stat) {
      if (stat.isBinary) {
        return { ...f, status: 'binary' as const, insertions: 0, deletions: 0, hunks: [] };
      }
      return { ...f, insertions: stat.insertions, deletions: stat.deletions };
    }
    return f;
  });

  // 5. Apply truncation
  const capped = applyTruncation(merged, 500);

  // 6. Compute totals
  const totals = capped.reduce(
    (acc, f) => ({
      files: acc.files + 1,
      insertions: acc.insertions + f.insertions,
      deletions: acc.deletions + f.deletions,
    }),
    { files: 0, insertions: 0, deletions: 0 },
  );

  return {
    files: capped,
    totalFilesChanged: totals.files,
    totalInsertions: totals.insertions,
    totalDeletions: totals.deletions,
  };
}

interface NumstatEntry {
  insertions: number;
  deletions: number;
  isBinary: boolean;
}

function parseNumstat(output: string): Map<string, NumstatEntry> {
  const map = new Map<string, NumstatEntry>();
  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    // Format: "<insertions>\t<deletions>\t<path>"
    // Binary: "-\t-\t<path>"
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const [insStr, delStr, ...rest] = parts;
    const path = rest.join('\t');
    if (insStr === '-' && delStr === '-') {
      map.set(path, { insertions: 0, deletions: 0, isBinary: true });
    } else {
      map.set(path, {
        insertions: parseInt(insStr, 10) || 0,
        deletions: parseInt(delStr, 10) || 0,
        isBinary: false,
      });
    }
  }
  return map;
}
