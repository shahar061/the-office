"use client";

import { motion } from "framer-motion";
import { Typewriter } from "./Typewriter";
import { ScreenshotFrame } from "./ScreenshotFrame";
import { TYPEWRITER_PHRASES } from "@/lib/constants";

const fadeIn = { initial: { opacity: 0 }, animate: { opacity: 1 } };
const fadeUp = (delay: number) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, delay },
});

export function Hero() {
  return (
    <section className="min-h-screen flex flex-col items-center justify-center px-6 pt-20 pb-16 bg-[radial-gradient(ellipse_at_center,#1a1a2e_0%,#0f0f1a_70%)]">
      {/* Badge */}
      <motion.p
        className="font-pixel text-[10px] tracking-[3px] text-accent-amber uppercase mb-6"
        {...fadeIn}
      >
        pixel.team
      </motion.p>

      {/* Headline */}
      <motion.div
        className="text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <h1 className="text-4xl md:text-5xl font-extrabold">
          <span className="text-text-muted">Describe </span>
          <Typewriter phrases={TYPEWRITER_PHRASES} />
        </h1>

        <motion.p
          className="text-4xl md:text-5xl font-extrabold text-text-primary mt-2"
          {...fadeUp(0.8)}
        >
          Watch it get built.
        </motion.p>
      </motion.div>

      {/* Subheadline */}
      <motion.p
        className="text-lg text-text-secondary max-w-xl text-center mb-9 mt-6"
        {...fadeUp(1.0)}
      >
        A pixel-art virtual office where 15 AI agents brainstorm, plan, and code
        your project — while you watch.
      </motion.p>

      {/* CTAs */}
      <motion.div
        className="flex flex-col sm:flex-row items-center gap-4"
        {...fadeUp(1.1)}
      >
        <a
          href="#download"
          className="bg-accent-blue text-white text-base font-semibold px-7 py-3.5 rounded-xl hover:shadow-[0_0_24px_rgba(59,130,246,0.5)] transition-shadow"
        >
          Download for macOS
        </a>
        <a
          href="https://github.com/shahar061/the-office"
          target="_blank"
          rel="noopener noreferrer"
          className="text-text-secondary underline underline-offset-4 hover:text-text-primary transition-colors"
        >
          View on GitHub &rarr;
        </a>
      </motion.div>

      {/* Screenshot */}
      <ScreenshotFrame
        src="/screenshot.png"
        alt="The Office — pixel-art virtual office with AI agents working"
      />

      {/* Trust line */}
      <motion.p
        className="text-text-dim text-sm mt-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
      >
        Free &amp; open source &middot; Bring your own API keys
      </motion.p>
    </section>
  );
}
