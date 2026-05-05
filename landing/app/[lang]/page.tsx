import { notFound } from "next/navigation";
import { LandingPage } from "@/components/LandingPage";
import { hasLocale, DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

interface PageProps {
  params: Promise<{ lang: string }>;
}

export default async function LocaleHome({ params }: PageProps) {
  const { lang } = await params;
  if (!hasLocale(lang) || lang === DEFAULT_LOCALE) notFound();
  const locale = lang as Locale;
  const dict = await getDictionary(locale);
  return <LandingPage locale={locale} dict={dict} />;
}
