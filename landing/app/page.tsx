import Nav from "../components/Nav";
import { Hero } from "../components/Hero";
import { ProblemSection } from "../components/ProblemSection";
import { PhasesSection } from "../components/PhasesSection";
import { OrgChart } from "../components/OrgChart";
import { FeaturesSection } from "../components/FeaturesSection";
import { WorkshopCallout } from "../components/WorkshopCallout";
import { MobileSection } from "../components/MobileSection";
import { FinalCTA } from "../components/FinalCTA";
import { Footer } from "../components/Footer";

export default function Home() {
  return (
    <main className="min-h-screen bg-bg">
      <Nav />
      <Hero />
      <ProblemSection />
      <PhasesSection />
      <OrgChart />
      <FeaturesSection />
      <WorkshopCallout />
      <MobileSection />
      <FinalCTA />
      <Footer />
    </main>
  );
}
