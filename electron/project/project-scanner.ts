import fs from 'fs';
import path from 'path';

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  '.the-office',
  'dist',
  'build',
  '.next',
  '.venv',
  '__pycache__',
]);

const DOT_FILE_ALLOWLIST = new Set(['.env.example']);

export class ProjectScanner {
  constructor(private projectDir: string) {}

  /**
   * Returns a condensed file tree as a newline-separated list of paths
   * relative to the project root. Excludes common build/dep directories
   * and dot-files (except those in DOT_FILE_ALLOWLIST). Capped at maxEntries
   * with a truncation marker appended if exceeded.
   */
  getFileTree(maxEntries: number = 300): string {
    const entries: string[] = [];
    let truncated = false;
    let totalSeen = 0;

    const walk = (dir: string): void => {
      if (entries.length >= maxEntries) {
        return;
      }

      let dirEntries: fs.Dirent[];
      try {
        dirEntries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }

      // Sort directory entries alphabetically for deterministic output
      dirEntries.sort((a, b) => a.name.localeCompare(b.name));

      for (const entry of dirEntries) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith('.') && !DOT_FILE_ALLOWLIST.has(entry.name)) continue;

        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(this.projectDir, fullPath);

        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          totalSeen++;
          if (entries.length < maxEntries) {
            entries.push(relPath);
          } else {
            truncated = true;
          }
        }
      }
    };

    try {
      walk(this.projectDir);
    } catch {
      return '';
    }

    // Final alphabetic sort across all collected files
    entries.sort();

    if (entries.length === 0) {
      return '';
    }

    let result = entries.join('\n');
    if (truncated) {
      const extraCount = totalSeen - entries.length;
      result += `\n... (${extraCount} more files, truncated)`;
    }
    return result;
  }
}
