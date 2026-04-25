import { describe, it, expect, beforeEach } from 'vitest';
import { t, setCurrentLanguage } from '../../src/renderer/src/i18n';

describe('t() lookup', () => {
  beforeEach(() => {
    setCurrentLanguage('en');
  });

  it('returns English string when lang=en', () => {
    expect(t('chat.input.send.aria')).toBe('Send message');
  });

  it('returns Hebrew string when lang=he and key is translated', () => {
    setCurrentLanguage('he');
    expect(t('chat.input.send.aria')).toBe('שלח הודעה');
  });

  it('falls back to English when lang=he and key missing in he', () => {
    setCurrentLanguage('he');
    expect(t('nonexistent.key' as any)).toBe('nonexistent.key');
  });

  it('returns the key itself when not found in either dictionary', () => {
    expect(t('totally.fake' as any)).toBe('totally.fake');
  });
});
