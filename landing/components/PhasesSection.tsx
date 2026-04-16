"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { PHASES } from "@/lib/constants";
import ScrollReveal from "./ScrollReveal";

function ProgressBar() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const width = useTransform(scrollYProgress, [0.1, 0.6], ["0%", "100%"]);

  return (
    <div ref={ref} className="max-w-2xl mx-auto mb-12">
      {/* Track + dots */}
      <div className="relative flex justify-between items-center">
        {/* Track background */}
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-border -translate-y-1/2">
          {/* Animated fill */}
          <motion.div
            className="h-full bg-gradient-to-r from-accent-blue via-accent-amber to-accent-green"
            style={{ width }}
          />
        </div>

        {/* Dots */}
        {PHASES.map((phase) => (
          <motion.div
            key={phase.name}
            className="w-4 h-4 rounded-full relative z-10"
            style={{ backgroundColor: phase.color }}
            whileInView={{
              boxShadow: `0 0 12px ${phase.color}80`,
              scale: [1, 1.3, 1],
            }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          />
        ))}
      </div>

      {/* Labels */}
      <div className="flex justify-between mt-2">
        {PHASES.map((phase) => (
          <span
            key={phase.name}
            className="font-pixel text-[9px] tracking-wider"
            style={{ color: phase.color }}
          >
            {phase.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function PhasesSection() {
  return (
    <section id="how-it-works" className="py-24 px-6">
      {/* Header */}
      <div className="text-center mb-12">
        <p className="font-pixel text-[10px] tracking-[3px] text-text-muted uppercase mb-4">
          HOW IT WORKS
        </p>
        <h2 className="text-3xl md:text-4xl font-extrabold text-text-primary mb-4">
          From napkin sketch to working code
        </h2>
        <p className="text-text-secondary text-lg max-w-xl mx-auto">
          Three structured phases keep your project on track, from idea to
          implementation.
        </p>
      </div>

      <ProgressBar />

      {/* Phase cards grid */}
      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
        {PHASES.map((phase, i) => (
          <ScrollReveal key={phase.name} delay={i * 0.15}>
            <motion.div
              className="bg-surface border border-border rounded-xl p-7 h-full"
              style={{ borderTopColor: phase.color, borderTopWidth: 3 }}
              whileHover={{ translateY: -4 }}
            >
              <p
                className="font-pixel text-[9px] tracking-wider mb-2"
                style={{ color: phase.color }}
              >
                {phase.label}
              </p>
              <h3 className="text-xl font-bold text-text-primary mb-2">
                {phase.name}
              </h3>
              <p className="text-sm text-text-secondary leading-relaxed mb-4">
                {phase.description}
              </p>
              <div className="border-t border-border pt-3">
                <p className="text-xs text-text-muted">{phase.artifacts}</p>
              </div>
            </motion.div>
          </ScrollReveal>
        ))}
      </div>

      {/* Screenshot slot */}
      <div className="max-w-3xl mx-auto mt-10 bg-surface-light border border-dashed border-border rounded-xl p-10 text-center">
        <p className="text-text-muted text-sm">
          Screenshot placeholder -- workflow visualization
        </p>
      </div>
    </section>
  );
}
