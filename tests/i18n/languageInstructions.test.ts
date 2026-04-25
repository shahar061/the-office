import { describe, it, expect } from 'vitest';
import { languageInstructions } from '../../electron/orchestrator/language';

describe('languageInstructions', () => {
  it('returns empty string for English', () => {
    expect(languageInstructions('en')).toBe('');
  });

  it('returns Hebrew addendum for Hebrew', () => {
    const result = languageInstructions('he');
    expect(result).toContain('Hebrew');
    expect(result).toContain('AskUserQuestion');
  });

  it('explicitly excludes tool names from translation', () => {
    const result = languageInstructions('he');
    expect(result).toMatch(/tool names.*never translate/i);
  });

  it('explicitly excludes code from translation', () => {
    const result = languageInstructions('he');
    expect(result).toMatch(/(code|variable|function|file paths).*English/i);
  });

  it('explicitly excludes filenames from translation', () => {
    const result = languageInstructions('he');
    expect(result).toMatch(/filenames.*English/i);
  });
});
