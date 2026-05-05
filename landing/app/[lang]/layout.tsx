import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Inter, Press_Start_2P } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "../globals.css";
import FloatingPixels from "../../components/FloatingPixels";
import {
  LOCALES,
  DEFAULT_LOCALE,
  dirFor,
  hasLocale,
  type Locale,
} from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const pressStart2P = Press_Start_2P({
  variable: "--font-pixel",
  weight: "400",
  subsets: ["latin"],
});

export async function generateStaticParams() {
  // English lives at "/" via the (en) route group, so exclude it here.
  return LOCALES.filter((l) => l !== DEFAULT_LOCALE).map((lang) => ({ lang }));
}

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}

export async function generateMetadata({
  params,
}: LayoutProps): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const dict = await getDictionary(lang);
  return {
    title: dict.meta.title,
    description: dict.meta.description,
    openGraph: {
      title: dict.meta.title,
      description: dict.meta.description,
      type: "website",
    },
  };
}

export default async function LocaleRootLayout({
  children,
  params,
}: LayoutProps) {
  const { lang } = await params;
  if (!hasLocale(lang) || lang === DEFAULT_LOCALE) notFound();
  const locale = lang as Locale;

  return (
    <html
      lang={locale}
      dir={dirFor(locale)}
      className={`${inter.variable} ${pressStart2P.variable}`}
      style={{ colorScheme: "dark" }}
    >
      <body className="min-h-screen antialiased">
        <FloatingPixels />
        <div className="relative z-10">{children}</div>
        <Analytics />
      </body>
    </html>
  );
}
