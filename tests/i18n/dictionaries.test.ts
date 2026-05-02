import { describe, it, expect } from 'vitest';
import { en } from '../../src/renderer/src/i18n/dictionaries/en';
import { he } from '../../src/renderer/src/i18n/dictionaries/he';
import { es } from '../../src/renderer/src/i18n/dictionaries/es';
import { it as itDict } from '../../src/renderer/src/i18n/dictionaries/it';
import { de } from '../../src/renderer/src/i18n/dictionaries/de';
import { pt } from '../../src/renderer/src/i18n/dictionaries/pt';

const NON_EN: Array<{ name: string; dict: Partial<Record<string, string>> }> = [
  { name: 'Hebrew', dict: he as Partial<Record<string, string>> },
  { name: 'Spanish', dict: es as Partial<Record<string, string>> },
  { name: 'Italian', dict: itDict as Partial<Record<string, string>> },
  { name: 'German', dict: de as Partial<Record<string, string>> },
  { name: 'Portuguese', dict: pt as Partial<Record<string, string>> },
];

describe('dictionaries', () => {
  it('every English value is a non-empty string', () => {
    for (const [key, val] of Object.entries(en)) {
      expect(typeof val).toBe('string');
      expect(val.length, `Empty value for key ${key}`).toBeGreaterThan(0);
    }
  });

  for (const { name, dict } of NON_EN) {
    it(`every ${name} value is a non-empty string`, () => {
      for (const [key, val] of Object.entries(dict)) {
        expect(typeof val).toBe('string');
        expect((val as string).length, `Empty value for key ${key}`).toBeGreaterThan(0);
      }
    });

    it(`every ${name} key is a valid English key`, () => {
      const enKeys = new Set(Object.keys(en));
      for (const key of Object.keys(dict)) {
        expect(enKeys.has(key), `${name} dictionary has unknown key: ${key}`).toBe(true);
      }
    });

    it(`${name} dictionary has parity with the other non-English dictionaries`, () => {
      // Whatever the EN source-of-truth doesn't yet cover, ALL non-EN
      // dictionaries should at least agree on which subset of keys they
      // translate — otherwise users see mixed-language UIs.
      const ours = new Set(Object.keys(dict));
      for (const other of NON_EN) {
        if (other.name === name) continue;
        const theirs = new Set(Object.keys(other.dict));
        const missingFromUs = [...theirs].filter(k => !ours.has(k));
        const extraInUs = [...ours].filter(k => !theirs.has(k));
        expect(
          missingFromUs.length + extraInUs.length,
          `${name} vs ${other.name} parity break — missing in ${name}: [${missingFromUs.slice(0, 5).join(', ')}${missingFromUs.length > 5 ? '…' : ''}]; extra in ${name}: [${extraInUs.slice(0, 5).join(', ')}${extraInUs.length > 5 ? '…' : ''}]`,
        ).toBe(0);
      }
    });
  }
});
