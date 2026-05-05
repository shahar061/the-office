"use client";

import { useState, useEffect } from "react";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { LocaleSwitcher } from "./LocaleSwitcher";

interface Props {
  dict: Dictionary["nav"];
  locale: Locale;
}

export default function Nav({ dict, locale }: Props) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { label: dict.features, href: "#features" },
    { label: dict.howItWorks, href: "#how-it-works" },
    {
      label: dict.github,
      href: "https://github.com/shahar061/the-office",
      external: true,
    },
  ];

  return (
    <nav
      className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 ${
        scrolled
          ? "bg-bg/80 backdrop-blur-md border-b border-border"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto max-w-6xl h-16 flex items-center justify-between px-6">
        {/* Left: logo */}
        <a
          href="#"
          className="font-pixel text-[11px] text-accent-amber tracking-widest"
        >
          pixel.team
        </a>

        {/* Right: links + locale + CTA */}
        <div className="flex items-center gap-4 md:gap-6">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              {...(link.external
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
              className="hidden md:block text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              {link.label}
            </a>
          ))}

          <LocaleSwitcher currentLocale={locale} />

          <a
            href="#download"
            className="bg-accent-blue text-white text-sm font-semibold px-5 py-2 rounded-lg hover:shadow-[0_0_20px_rgba(59,130,246,0.4)] transition-shadow"
          >
            {dict.download}
          </a>
        </div>
      </div>
    </nav>
  );
}
