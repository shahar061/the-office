"use client";

import { motion } from "framer-motion";

const fadeUp = (delay: number) => ({
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.5, delay },
});

const fadeIn = (delay: number) => ({
  initial: { opacity: 0 },
  whileInView: { opacity: 1 },
  viewport: { once: true },
  transition: { duration: 0.5, delay },
});

export function FinalCTA() {
  return (
    <section className="relative py-24 px-6 bg-[radial-gradient(ellipse_at_center,#1a1a2e_0%,#0f0f1a_70%)]">
      <div className="max-w-2xl mx-auto text-center">
        <motion.h2
          className="text-3xl md:text-4xl font-bold text-text-primary"
          {...fadeUp(0)}
        >
          Start building with your AI team.
        </motion.h2>

        <motion.p
          className="text-text-secondary text-[17px] mt-4"
          {...fadeIn(0.2)}
        >
          Free. Open source. Bring your own API keys.
        </motion.p>

        <motion.div
          className="flex flex-col items-center gap-4 mt-8"
          {...fadeUp(0.4)}
        >
          <div className="relative inline-block">
            <a
              href="https://github.com/shahar061/the-office"
              target="_blank"
              rel="noopener noreferrer"
              className="relative z-10 inline-block bg-accent-blue text-white text-[17px] font-semibold px-8 py-4 rounded-xl hover:shadow-[0_0_30px_rgba(59,130,246,0.3)] transition-shadow"
            >
              Download pixel.team
            </a>
            <span
              className="absolute inset-[-6px] border border-accent-blue/20 rounded-2xl pointer-events-none"
              style={{ animation: "pulse-ring 2s ease-out infinite" }}
            />
            <span
              className="absolute inset-[-12px] border border-accent-blue/10 rounded-2xl pointer-events-none"
              style={{
                animation: "pulse-ring 2s ease-out infinite",
                animationDelay: "0.5s",
              }}
            />
          </div>

          <a
            href="https://github.com/shahar061/the-office"
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-secondary text-[15px] hover:text-text-primary transition-colors"
          >
            View on GitHub &rarr;
          </a>
        </motion.div>

        <motion.p
          className="text-text-dim text-sm mt-8"
          {...fadeIn(0.6)}
        >
          Works with Claude Code &middot; macOS &middot; Open Source
        </motion.p>
      </div>
    </section>
  );
}
