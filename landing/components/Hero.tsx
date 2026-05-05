"use client";

import { motion } from "framer-motion";
import { Typewriter } from "./Typewriter";
import { ScreenshotFrame } from "./ScreenshotFrame";
import { PrimaryDownloadButton } from "./PrimaryDownloadButton";
import type { Dictionary } from "@/lib/i18n/dictionaries";

const fadeIn = { initial: { opacity: 0 }, animate: { opacity: 1 } };
const fadeUp = (delay: number) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, delay },
});

interface Props {
  dict: Dictionary["hero"];
}

export function Hero({ dict }: Props) {
  return (
    <section className="min-h-screen flex flex-col items-center justify-center px-6 pt-20 pb-16 bg-[radial-gradient(ellipse_at_center,#1a1a2e_0%,#0f0f1a_70%)]">
      {/* Badge */}
      <motion.p
        className="font-pixel text-[10px] tracking-[3px] text-accent-amber uppercase mb-6"
        {...fadeIn}
      >
        {dict.badge}
      </motion.p>

      {/* Headline */}
      <motion.div
        className="text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <h1 className="text-4xl md:text-5xl font-extrabold">
          <span className="text-text-muted">{dict.headlinePrefix}</span>
          <Typewriter phrases={dict.typewriterPhrases} />
        </h1>

        <motion.p
          className="text-4xl md:text-5xl font-extrabold text-text-primary mt-2"
          {...fadeUp(0.8)}
        >
          {dict.headlineSuffix}
        </motion.p>
      </motion.div>

      {/* Subheadline */}
      <motion.p
        className="text-lg text-text-secondary max-w-xl text-center mb-9 mt-6"
        {...fadeUp(1.0)}
      >
        {dict.subheadline}
      </motion.p>

      {/* CTAs */}
      <motion.div
        className="flex flex-col items-center gap-3"
        {...fadeUp(1.1)}
      >
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <PrimaryDownloadButton
            className="bg-accent-blue text-white text-base font-semibold px-7 py-3.5 rounded-xl hover:shadow-[0_0_24px_rgba(59,130,246,0.5)] transition-shadow"
          />
          <a
            href="https://github.com/shahar061/the-office"
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-secondary underline underline-offset-4 hover:text-text-primary transition-colors"
          >
            {dict.viewOnGithub}
          </a>
        </div>
        <a
          href="#download"
          className="text-text-dim text-sm hover:text-text-secondary transition-colors"
        >
          {dict.otherPlatforms}
        </a>
      </motion.div>

      {/* Hero clip */}
      <ScreenshotFrame
        videoSrc="/media/hero.mp4"
        posterSrc="/media/hero-poster.jpg"
        alt={dict.screenshotAlt}
      />

      {/* Trust line */}
      <motion.p
        className="text-text-dim text-sm mt-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
      >
        {dict.trustLine}
      </motion.p>
    </section>
  );
}
