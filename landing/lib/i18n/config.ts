// Public, client-safe locale config. Imported by both server and client code.

export const LOCALES = ["en", "he", "es", "it", "pt", "de"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Locales rendered right-to-left. */
export const RTL_LOCALES = new Set<Locale>(["he"]);

/** Native names shown in the locale switcher. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  he: "עברית",
  es: "Español",
  it: "Italiano",
  pt: "Português",
  de: "Deutsch",
};

export const dirFor = (locale: Locale): "ltr" | "rtl" =>
  RTL_LOCALES.has(locale) ? "rtl" : "ltr";

export const hasLocale = (value: string): value is Locale =>
  (LOCALES as readonly string[]).includes(value);
