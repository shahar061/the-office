import Nav from "../components/Nav";
import { Hero } from "../components/Hero";
import { ProblemSection } from "../components/ProblemSection";

export default function Home() {
  return (
    <main className="min-h-screen bg-bg">
      <Nav />
      <Hero />
      <ProblemSection />
    </main>
  );
}
