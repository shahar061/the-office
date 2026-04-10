import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ProjectScanner } from '../../../electron/project/project-scanner';

describe('ProjectScanner', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function touch(relPath: string): void {
    const full = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, '');
  }

  it('returns empty string for empty directory', () => {
    const scanner = new ProjectScanner(tmpDir);
    expect(scanner.getFileTree()).toBe('');
  });

  it('lists files relative to the project root', () => {
    touch('src/index.ts');
    touch('package.json');
    const scanner = new ProjectScanner(tmpDir);
    const result = scanner.getFileTree();
    expect(result).toContain('package.json');
    expect(result).toContain('src/index.ts');
  });

  it('excludes node_modules', () => {
    touch('src/index.ts');
    touch('node_modules/foo/index.js');
    const scanner = new ProjectScanner(tmpDir);
    const result = scanner.getFileTree();
    expect(result).toContain('src/index.ts');
    expect(result).not.toContain('node_modules');
  });

  it('excludes .git, .the-office, dist, build', () => {
    touch('src/index.ts');
    touch('.git/HEAD');
    touch('.the-office/config.json');
    touch('dist/bundle.js');
    touch('build/output.js');
    const scanner = new ProjectScanner(tmpDir);
    const result = scanner.getFileTree();
    expect(result).toContain('src/index.ts');
    expect(result).not.toContain('.git');
    expect(result).not.toContain('.the-office');
    expect(result).not.toContain('dist/');
    expect(result).not.toContain('build/');
  });

  it('excludes dot-files except .env.example', () => {
    touch('src/index.ts');
    touch('.env');
    touch('.env.example');
    touch('.prettierrc');
    const scanner = new ProjectScanner(tmpDir);
    const result = scanner.getFileTree();
    expect(result).toContain('src/index.ts');
    expect(result).toContain('.env.example');
    expect(result).not.toContain('.env\n');
    expect(result).not.toContain('.prettierrc');
  });

  it('INCLUDES files under docs/office', () => {
    touch('src/index.ts');
    touch('docs/office/01-vision-brief.md');
    const scanner = new ProjectScanner(tmpDir);
    const result = scanner.getFileTree();
    expect(result).toContain('docs/office/01-vision-brief.md');
  });

  it('truncates when file count exceeds maxEntries', () => {
    for (let i = 0; i < 10; i++) {
      touch(`file-${i}.txt`);
    }
    const scanner = new ProjectScanner(tmpDir);
    const result = scanner.getFileTree(5);
    const lines = result.split('\n').filter(l => l.length > 0);
    expect(lines.length).toBeLessThanOrEqual(6); // 5 files + truncation marker
    expect(result).toContain('(5 more files, truncated)');
  });

  it('sorts entries alphabetically', () => {
    touch('zzz.txt');
    touch('aaa.txt');
    touch('mmm.txt');
    const scanner = new ProjectScanner(tmpDir);
    const result = scanner.getFileTree();
    const lines = result.split('\n').filter(l => l.length > 0);
    expect(lines).toEqual(['aaa.txt', 'mmm.txt', 'zzz.txt']);
  });
});
