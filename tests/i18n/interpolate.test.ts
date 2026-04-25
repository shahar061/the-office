import { describe, it, expect, beforeEach } from 'vitest';
import { t, setCurrentLanguage } from '../../src/renderer/src/i18n';

describe('t() interpolation', () => {
  beforeEach(() => setCurrentLanguage('en'));

  it('substitutes a single variable', () => {
    expect(t('chat.input.placeholder.responding', { agent: 'CEO' }))
      .toBe('Responding to CEO...');
  });

  it('substitutes multiple variables', () => {
    expect(t('chat.archived.run', { number: 1, agent: 'CEO' }))
      .toBe('Run 1 — CEO');
  });

  it('renders missing variables as {name}', () => {
    expect(t('chat.archived.run', { number: 1 }))
      .toBe('Run 1 — {agent}');
  });

  it('returns plain template when no vars passed and template has no placeholders', () => {
    expect(t('settings.title')).toBe('Settings');
  });
});
