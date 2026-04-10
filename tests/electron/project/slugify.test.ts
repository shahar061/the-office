import { describe, it, expect } from 'vitest';
import { slugifyTitle } from '../../../electron/project/slugify';

describe('slugifyTitle', () => {
  it('lowercases and hyphenates a simple title', () => {
    expect(slugifyTitle('Add Dark Mode Toggle')).toBe('add-dark-mode-toggle');
  });

  it('replaces non-alphanumeric characters with dashes', () => {
    expect(slugifyTitle('Fix: bug in Header.tsx (#42)')).toBe('fix-bug-in-header-tsx-42');
  });

  it('collapses multiple dashes', () => {
    expect(slugifyTitle('foo   bar---baz')).toBe('foo-bar-baz');
  });

  it('trims leading and trailing dashes', () => {
    expect(slugifyTitle('!!hello!!')).toBe('hello');
  });

  it('truncates to 50 characters without trailing dash', () => {
    const long = 'a'.repeat(30) + ' ' + 'b'.repeat(30);
    const result = slugifyTitle(long);
    expect(result.length).toBeLessThanOrEqual(50);
    expect(result.endsWith('-')).toBe(false);
  });

  it('returns "untitled" for an empty string', () => {
    expect(slugifyTitle('')).toBe('untitled');
  });

  it('returns "untitled" for a string with only special chars', () => {
    expect(slugifyTitle('!!!---???')).toBe('untitled');
  });

  it('handles unicode by stripping it', () => {
    expect(slugifyTitle('café ☕ time')).toBe('caf-time');
  });
});
