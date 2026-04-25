import fs from 'fs';
import path from 'path';

const FLAG_PATH = '.the-office/mock-mode.flag';

export function flagFilePath(projectDir: string): string {
  return path.join(projectDir, FLAG_PATH);
}

export function writeModeFlag(projectDir: string, mode: 'real' | 'mock'): void {
  const fp = flagFilePath(projectDir);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  if (mode === 'mock') {
    fs.writeFileSync(fp, 'mock', 'utf-8');
  } else if (fs.existsSync(fp)) {
    fs.unlinkSync(fp);
  }
}

export function readModeFlag(projectDir: string): 'real' | 'mock' {
  const fp = flagFilePath(projectDir);
  if (fs.existsSync(fp)) {
    const content = fs.readFileSync(fp, 'utf-8').trim();
    if (content === 'mock') return 'mock';
  }
  return 'real';
}

/**
 * Update process.env.OFFICE_MOCK_AGENTS based on the project's flag file.
 * Call this at project-open time and before every phase start.
 */
export function applyModeFlagToEnv(projectDir: string): void {
  const mode = readModeFlag(projectDir);
  process.env.OFFICE_MOCK_AGENTS = mode === 'mock' ? '1' : '0';
}
