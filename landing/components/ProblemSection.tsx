"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { PROBLEM_CARDS } from "@/lib/constants";

const Y_OFFSETS = [-40, -20, 20, 40] as const;

function ProblemCard({
  emoji,
  title,
  description,
  index,
}: {
  emoji: string;
  title: string;
  description: string;
  index: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const fromLeft = index % 2 === 0;
  const yOffset = Y_OFFSETS[index];

  const x = useTransform(scrollYProgress, [0, 0.5], [fromLeft ? -60 : 60, 0]);
  const y = useTransform(scrollYProgress, [0, 0.5], [yOffset, 0]);
  const rotate = useTransform(
    scrollYProgress,
    [0, 0.5],
    [fromLeft ? -2 : 2, 0]
  );
  const opacity = useTransform(scrollYProgress, [0, 0.3], [0, 1]);

  return (
    <motion.div
      ref={ref}
      style={{ x, y, rotate, opacity }}
      whileHover={{
        translateY: -4,
        borderColor: "rgba(59,130,246,0.3)",
      }}
      className="bg-surface border border-border rounded-xl p-6 transition-colors"
    >
      <p className="text-2xl mb-2">{emoji}</p>
      <h3 className="text-text-primary text-[15px] font-semibold mb-1.5">
        {title}
      </h3>
      <p className="text-text-dim text-[13px] leading-relaxed">
        {description}
      </p>
    </motion.div>
  );
}

export function ProblemSection() {
  return (
    <section className="py-24 px-6">
      {/* Header */}
      <div className="text-center mb-12">
        <p className="font-pixel text-[10px] tracking-[3px] text-text-muted uppercase mb-4">
          THE PROBLEM
        </p>
        <h2 className="text-3xl md:text-4xl font-extrabold text-text-primary mb-4">
          Great ideas shouldn&apos;t die in your notes app
        </h2>
        <p className="text-text-secondary text-lg max-w-xl mx-auto">
          There&apos;s a canyon between having a vision and shipping a product.
          Most people get stuck somewhere in between.
        </p>
      </div>

      {/* Cards grid */}
      <div className="max-w-2xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-4">
        {PROBLEM_CARDS.map((card, index) => (
          <ProblemCard
            key={card.title}
            emoji={card.emoji}
            title={card.title}
            description={card.description}
            index={index}
          />
        ))}
      </div>
    </section>
  );
}
