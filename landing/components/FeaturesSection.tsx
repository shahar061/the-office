"use client";

import { FEATURES, Feature } from "@/lib/constants";
import ScrollReveal from "./ScrollReveal";

function FeatureBlock({ feature, index }: { feature: Feature; index: number }) {
  const reversed = index % 2 !== 0;

  return (
    <div
      className={`flex flex-col md:flex-row gap-10 items-center max-w-4xl mx-auto mb-14 last:mb-0 ${
        reversed ? "md:flex-row-reverse" : ""
      }`}
    >
      {/* Text side */}
      <ScrollReveal
        className="flex-1"
        direction={reversed ? "right" : "left"}
        distance={40}
      >
        <p
          className="font-pixel text-[9px] tracking-wider uppercase mb-2"
          style={{ color: feature.labelColor }}
        >
          {feature.label}
        </p>
        <h3 className="text-text-primary text-[22px] font-semibold mb-2.5">
          {feature.title}
        </h3>
        <p className="text-text-secondary text-[15px] leading-relaxed">
          {feature.description}
        </p>
      </ScrollReveal>

      {/* Image side */}
      <ScrollReveal
        className="flex-1"
        direction={reversed ? "left" : "right"}
        distance={40}
        delay={0.15}
      >
        <div className="relative bg-surface-light border border-dashed border-border rounded-xl p-16 text-center text-text-dim text-xs overflow-hidden">
          {"📸 " + feature.screenshotHint}
          <div
            className="absolute top-0 left-0 right-0 h-0.5 opacity-50"
            style={{
              background: `linear-gradient(90deg, transparent, ${feature.labelColor}44, transparent)`,
              animation: "scanline 3s ease-in-out infinite",
            }}
          />
        </div>
      </ScrollReveal>
    </div>
  );
}

export function FeaturesSection() {
  return (
    <section id="features" className="py-24 px-6">
      {/* Divider */}
      <div className="max-w-xs mx-auto mb-20">
        <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        <p className="text-center text-text-dim text-xs mt-3 tracking-widest">
          · · ·
        </p>
      </div>

      {/* Header */}
      <div className="text-center mb-16">
        <p className="font-pixel text-[10px] tracking-[3px] text-text-muted uppercase mb-4">
          FEATURES
        </p>
        <h2 className="text-3xl md:text-4xl font-extrabold text-text-primary">
          Not just watching. Working.
        </h2>
      </div>

      {/* Feature blocks */}
      {FEATURES.map((feature, index) => (
        <FeatureBlock key={feature.label} feature={feature} index={index} />
      ))}
    </section>
  );
}
