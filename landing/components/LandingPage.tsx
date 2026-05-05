import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import Nav from "./Nav";
import { Hero } from "./Hero";
import { ProblemSection } from "./ProblemSection";
import { PhasesSection } from "./PhasesSection";
import { OrgChart } from "./OrgChart";
import { FeaturesSection } from "./FeaturesSection";
import { WorkshopCallout } from "./WorkshopCallout";
import { MobileSection } from "./MobileSection";
import { FinalCTA } from "./FinalCTA";
import { DownloadSection } from "./DownloadSection";
import { Footer } from "./Footer";

interface Props {
  locale: Locale;
  dict: Dictionary;
}

export function LandingPage({ locale, dict }: Props) {
  return (
    <main className="min-h-screen bg-bg">
      <Nav dict={dict.nav} locale={locale} />
      <Hero dict={dict.hero} />
      <ProblemSection dict={dict.problem} />
      <PhasesSection dict={dict.phases} />
      <OrgChart dict={dict.orgChart} />
      <FeaturesSection dict={dict.features} />
      <WorkshopCallout dict={dict.workshop} />
      <MobileSection dict={dict.mobile} />
      <FinalCTA dict={dict.finalCta} />
      <DownloadSection dict={dict.download} locale={locale} />
      <Footer dict={dict.footer} />
    </main>
  );
}
