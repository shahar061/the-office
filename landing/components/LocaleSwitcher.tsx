"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  LOCALES,
  LOCALE_LABELS,
  DEFAULT_LOCALE,
  hasLocale,
  type Locale,
} from "@/lib/i18n/config";

interface Props {
  currentLocale: Locale;
}

const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/**
 * Replace (or insert) the locale prefix in a path.
 * - English (the default) lives at the bare path: `/`, `/about`.
 * - Other locales live under a prefix: `/he`, `/he/about`.
 */
function swapLocale(pathname: string, nextLocale: Locale): string {
  const segments = pathname.split("/").filter(Boolean);
  const first = segments[0];
  const rest = first && hasLocale(first) ? segments.slice(1) : segments;

  if (nextLocale === DEFAULT_LOCALE) {
    return "/" + rest.join("/");
  }
  return "/" + [nextLocale, ...rest].join("/");
}

export function LocaleSwitcher({ currentLocale }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const select = (locale: Locale) => {
    document.cookie = `NEXT_LOCALE=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax`;
    router.push(swapLocale(pathname, locale));
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="text-sm text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5"
      >
        <span>{LOCALE_LABELS[currentLocale]}</span>
        <span className="text-text-dim text-[10px]">▾</span>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute end-0 mt-2 min-w-[160px] bg-[#1a1a2e] border border-[#2a2a3a] rounded-lg shadow-2xl shadow-black/50 backdrop-blur-md overflow-hidden py-1 z-50"
        >
          {LOCALES.map((loc) => {
            const active = loc === currentLocale;
            return (
              <li key={loc}>
                <button
                  type="button"
                  onClick={() => select(loc)}
                  className={`w-full text-start px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-[#3b82f6]/15 text-[#3b82f6]"
                      : "text-[#94a3b8] hover:bg-[#26263d] hover:text-[#e2e8f0]"
                  }`}
                  aria-selected={active}
                  role="option"
                >
                  {LOCALE_LABELS[loc]}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
