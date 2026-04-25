import { describe, it, expect } from 'vitest';
import { en } from '../../src/renderer/src/i18n/dictionaries/en';
import { he } from '../../src/renderer/src/i18n/dictionaries/he';

describe('dictionaries', () => {
  it('every English value is a non-empty string', () => {
    for (const [key, val] of Object.entries(en)) {
      expect(typeof val).toBe('string');
      expect(val.length, `Empty value for key ${key}`).toBeGreaterThan(0);
    }
  });

  it('every Hebrew value is a non-empty string', () => {
    for (const [key, val] of Object.entries(he)) {
      expect(typeof val).toBe('string');
      expect(val!.length, `Empty value for key ${key}`).toBeGreaterThan(0);
    }
  });

  it('every Hebrew key is a valid English key', () => {
    const enKeys = new Set(Object.keys(en));
    for (const key of Object.keys(he)) {
      expect(enKeys.has(key), `Hebrew dictionary has unknown key: ${key}`).toBe(true);
    }
  });
});
