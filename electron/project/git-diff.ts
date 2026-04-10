import type { DiffFile, DiffHunkLine } from '../../shared/types';

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
