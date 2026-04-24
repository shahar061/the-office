import { describe, it, expect, afterAll } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CLI = 'npx tsx dev-jump/cli/dev-jump.ts';

describe('dev-jump CLI', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-jump-cli-test-'));

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('exits non-zero on unknown target', () => {
    let exitCode = 0;
    try {
      execSync(`${CLI} imagine.nonexistent`, { stdio: 'pipe' });
    } catch (err: any) {
      exitCode = err.status ?? 1;
    }
    expect(exitCode).not.toBe(0);
  });

  it('seeds into a forced project dir and prints the path', () => {
    const projectDir = path.join(tmpDir, 'proj-real');
    const out = execSync(
      `${CLI} imagine.ui-ux-expert --force --project-dir ${projectDir}`,
      { encoding: 'utf-8' },
    );
    expect(out).toContain('✓ Seeded for UI/UX Expert');
    expect(out).toContain('REAL mode');
    expect(fs.existsSync(path.join(projectDir, 'docs/office/01-vision-brief.md'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'docs/office/05-ui-designs/index.md'))).toBe(false);
  });

  it('passes --mock through to mode output', () => {
    const projectDir = path.join(tmpDir, 'proj-mock');
    const out = execSync(
      `${CLI} imagine.ui-ux-expert --mock --force --project-dir ${projectDir}`,
      { encoding: 'utf-8' },
    );
    expect(out).toContain('MOCK mode');
  });
});
