import Nav from "../components/Nav";
import { Hero } from "../components/Hero";
import { ProblemSection } from "../components/ProblemSection";
import { PhasesSection } from "../components/PhasesSection";
import { OrgChart } from "../components/OrgChart";

export default function Home() {
  return (
    <main className="min-h-screen bg-bg">
      <Nav />
      <Hero />
      <ProblemSection />
      <PhasesSection />
      <OrgChart />
    </main>
  );
}
