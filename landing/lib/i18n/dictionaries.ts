import "server-only";
import type { Locale } from "./config";
import type enDict from "./dictionaries/en.json";

export type Dictionary = typeof enDict;

const dictionaries: Record<Locale, () => Promise<Dictionary>> = {
  en: () => import("./dictionaries/en.json").then((m) => m.default as Dictionary),
  he: () => import("./dictionaries/he.json").then((m) => m.default as Dictionary),
  es: () => import("./dictionaries/es.json").then((m) => m.default as Dictionary),
  it: () => import("./dictionaries/it.json").then((m) => m.default as Dictionary),
  pt: () => import("./dictionaries/pt.json").then((m) => m.default as Dictionary),
  de: () => import("./dictionaries/de.json").then((m) => m.default as Dictionary),
};

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return dictionaries[locale]();
}
