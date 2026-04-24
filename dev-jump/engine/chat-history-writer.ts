import fs from 'fs';
import path from 'path';

export function writeChatHistoryFiles(
  projectDir: string,
  fixturesDir: string,
  filenames: readonly string[],
): void {
  const destDir = path.join(projectDir, '.the-office', 'chat-history');
  fs.mkdirSync(destDir, { recursive: true });

  for (const name of filenames) {
    const src = path.join(fixturesDir, name);
    if (!fs.existsSync(src)) {
      throw new Error(`[dev-jump] Missing fixture chat-history file: ${src}`);
    }
    fs.copyFileSync(src, path.join(destDir, name));
  }
}
