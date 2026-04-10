import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ArtifactStore } from '../../../electron/project/artifact-store';

describe('ArtifactStore onboarding support', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-onboarding-test-'));
    fs.mkdirSync(path.join(tmpDir, 'docs', 'office'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(relPath: string, content: string) {
    fs.writeFileSync(path.join(tmpDir, 'docs', 'office', relPath), content);
  }

  it('hasOnboardingScan returns false when PROJECT_CONTEXT.md is missing', () => {
    const store = new ArtifactStore(tmpDir);
    expect(store.hasOnboardingScan()).toBe(false);
  });

  it('hasOnboardingScan returns true when PROJECT_CONTEXT.md exists', () => {
    writeFile('PROJECT_CONTEXT.md', '# Project Context');
    const store = new ArtifactStore(tmpDir);
    expect(store.hasOnboardingScan()).toBe(true);
  });

  it('getImagineContext is empty when no artifacts exist', () => {
    const store = new ArtifactStore(tmpDir);
    expect(store.getImagineContext()).toBe('');
  });

  it('getImagineContext includes PROJECT_CONTEXT.md when present', () => {
    writeFile('PROJECT_CONTEXT.md', '# Project Context\n\nA test app.');
    const store = new ArtifactStore(tmpDir);
    const context = store.getImagineContext();
    expect(context).toContain('Project Context');
    expect(context).toContain('A test app.');
  });

  it('getImagineContext includes CONVENTIONS.md when present', () => {
    writeFile('CONVENTIONS.md', '# Conventions\n\nUse vitest.');
    const store = new ArtifactStore(tmpDir);
    const context = store.getImagineContext();
    expect(context).toContain('Conventions');
    expect(context).toContain('Use vitest.');
  });

  it('getImagineContext includes BOTH scan files when present', () => {
    writeFile('PROJECT_CONTEXT.md', '# Project Context\n\nA test app.');
    writeFile('CONVENTIONS.md', '# Conventions\n\nUse vitest.');
    const store = new ArtifactStore(tmpDir);
    const context = store.getImagineContext();
    expect(context).toContain('A test app.');
    expect(context).toContain('Use vitest.');
  });

  it('getImagineContext combines imagine artifacts with scan files', () => {
    writeFile('01-vision-brief.md', '# Vision Brief\n\nBuild a todo app.');
    writeFile('PROJECT_CONTEXT.md', '# Project Context\n\nReact + TypeScript.');
    const store = new ArtifactStore(tmpDir);
    const context = store.getImagineContext();
    expect(context).toContain('Build a todo app.');
    expect(context).toContain('React + TypeScript.');
  });
});
