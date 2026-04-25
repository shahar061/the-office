import { en, type StringKey } from './dictionaries/en';
import { he } from './dictionaries/he';

export type Language = 'en' | 'he';
export type { StringKey } from './dictionaries/en';

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
  if (lang === 'he') {
    const heValue = he[key];
    if (heValue !== undefined) return heValue;
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

import { useSyncExternalStore } from 'react';

export function useT() {
  useSyncExternalStore(
    (cb) => subscribeToLanguage(cb),
    () => currentLang,
  );
  return (key: StringKey, vars?: Record<string, string | number>) =>
    interpolate(lookup(currentLang, key), vars);
}
