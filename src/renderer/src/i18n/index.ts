import { en, type StringKey } from './dictionaries/en';
import { he } from './dictionaries/he';
import { es } from './dictionaries/es';
import { it } from './dictionaries/it';
import { de } from './dictionaries/de';
import { pt } from './dictionaries/pt';

export type Language = 'en' | 'he' | 'es' | 'it' | 'de' | 'pt';
export type { StringKey } from './dictionaries/en';

const NON_EN_DICTIONARIES: Record<Exclude<Language, 'en'>, Partial<Record<StringKey, string>>> = {
  he,
  es,
  it,
  de,
  pt,
};

let currentLang: Language = 'en';
const listeners = new Set<() => void>();

export function setCurrentLanguage(lang: Language): void {
  if (currentLang === lang) return;
  currentLang = lang;
  for (const l of listeners) l();
}

export function getCurrentLanguage(): Language {
  return currentLang;
}

export function subscribeToLanguage(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function t(key: StringKey, vars?: Record<string, string | number>): string {
  return interpolate(lookup(currentLang, key), vars);
}

function lookup(lang: Language, key: StringKey): string {
  if (lang !== 'en') {
    const localized = NON_EN_DICTIONARIES[lang][key];
    if (localized !== undefined) return localized;
  }
  const enValue = en[key];
  if (enValue !== undefined) return enValue;
  return key;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name) =>
    vars[name] !== undefined ? String(vars[name]) : `{${name}}`,
  );
}

import { useCallback, useSyncExternalStore } from 'react';

export function useT() {
  const lang = useSyncExternalStore(
    (cb) => subscribeToLanguage(cb),
    () => currentLang,
  );
  return useCallback(
    (key: StringKey, vars?: Record<string, string | number>) =>
      interpolate(lookup(lang, key), vars),
    [lang],
  );
}

export function useLang(): Language {
  return useSyncExternalStore(
    (cb) => subscribeToLanguage(cb),
    () => currentLang,
  );
}
