import { describe, it, expect } from 'vitest';
import os from 'os';
import path from 'path';
import { resolveSafeProjectDir, UnsafeProjectDirError } from '../../dev-jump/engine/safety';

describe('resolveSafeProjectDir', () => {
  const safePath = path.join(os.homedir(), 'office-dev-project');

  it('returns the canonical path when called with no argument', () => {
    expect(resolveSafeProjectDir()).toBe(safePath);
  });

  it('returns the canonical path when given a matching path', () => {
    expect(resolveSafeProjectDir(safePath)).toBe(safePath);
  });

  it('resolves relative path segments to canonical path', () => {
    const nested = path.join(safePath, 'foo', '..');
    expect(resolveSafeProjectDir(nested)).toBe(safePath);
  });

  it('throws UnsafeProjectDirError for any other path', () => {
    expect(() => resolveSafeProjectDir('/tmp/anything')).toThrow(UnsafeProjectDirError);
  });

  it('throws UnsafeProjectDirError for traversal out of safe dir', () => {
    const escape = path.join(safePath, '..', 'other-project');
    expect(() => resolveSafeProjectDir(escape)).toThrow(UnsafeProjectDirError);
  });

  it('accepts override only with explicit force flag', () => {
    expect(() => resolveSafeProjectDir('/tmp/elsewhere', { force: true })).not.toThrow();
    expect(resolveSafeProjectDir('/tmp/elsewhere', { force: true })).toBe('/tmp/elsewhere');
  });
});
