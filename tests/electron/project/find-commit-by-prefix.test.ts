import { describe, it, expect } from 'vitest';
import { findCommitByPrefix } from '../../../electron/project/find-commit-by-prefix';

describe('findCommitByPrefix', () => {
  it('returns null for empty input', () => {
    expect(findCommitByPrefix('', 'imagine:')).toBeNull();
  });

  it('returns null when no lines match', () => {
    const log = 'abc123|fix: typo\ndef456|chore: deps';
    expect(findCommitByPrefix(log, 'imagine:')).toBeNull();
  });

  it('returns the first matching SHA', () => {
    const log = [
      'aaa111|complete: RUN.md and completion summary',
      'bbb222|build: initial implementation',
      'ccc333|warroom: system design, implementation plan',
      'ddd444|imagine: vision brief, PRD, market analysis',
      'eee555|Initial commit (The Office)',
    ].join('\n');
    expect(findCommitByPrefix(log, 'imagine:')).toBe('ddd444');
    expect(findCommitByPrefix(log, 'warroom:')).toBe('ccc333');
    expect(findCommitByPrefix(log, 'Initial commit (The Office)')).toBe('eee555');
  });

  it('returns the first (topmost = most recent) match when multiple exist', () => {
    const log = [
      'new123|build: initial implementation',
      'old456|build: initial implementation',
    ].join('\n');
    expect(findCommitByPrefix(log, 'build:')).toBe('new123');
  });

  it('skips lines without a pipe separator', () => {
    const log = [
      'malformed line with no pipe',
      'aaa111|imagine: vision brief',
    ].join('\n');
    expect(findCommitByPrefix(log, 'imagine:')).toBe('aaa111');
  });

  it('skips blank lines', () => {
    const log = [
      '',
      '',
      'aaa111|imagine: vision brief',
    ].join('\n');
    expect(findCommitByPrefix(log, 'imagine:')).toBe('aaa111');
  });

  it('matches literal string prefix (not regex)', () => {
    const log = 'aaa111|imagine.* something';
    expect(findCommitByPrefix(log, 'imagine:')).toBeNull();
    expect(findCommitByPrefix(log, 'imagine.')).toBe('aaa111');
  });

  it('handles subjects containing pipes', () => {
    const log = 'aaa111|build: some | weird | message';
    expect(findCommitByPrefix(log, 'build:')).toBe('aaa111');
  });
});
