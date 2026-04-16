"use client";

import { motion, useMotionValue, useTransform } from "framer-motion";
import Image from "next/image";
import type { MouseEvent } from "react";

interface ScreenshotFrameProps {
  src: string;
  alt: string;
}

export function ScreenshotFrame({ src, alt }: ScreenshotFrameProps) {
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);

  const rotateX = useTransform(mouseY, [0, 1], [3, -3]);
  const rotateY = useTransform(mouseX, [0, 1], [-3, 3]);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set((e.clientX - rect.left) / rect.width);
    mouseY.set((e.clientY - rect.top) / rect.height);
  };

  const handleMouseLeave = () => {
    mouseX.set(0.5);
    mouseY.set(0.5);
  };

  return (
    <motion.div
      style={{ perspective: 1000, rotateX, rotateY }}
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 100, damping: 20, delay: 1.2 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="w-full max-w-5xl mt-12"
    >
      <div className="bg-surface rounded-xl border border-border overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
        {/* Window chrome bar */}
        <div className="flex items-center gap-1.5 px-4 py-2.5 bg-surface-light border-b border-border">
          <span className="w-2.5 h-2.5 rounded-full bg-accent-red" />
          <span className="w-2.5 h-2.5 rounded-full bg-accent-amber" />
          <span className="w-2.5 h-2.5 rounded-full bg-accent-green" />
          <span className="flex-1 text-center text-text-dim text-xs">
            The Office — pixel.team
          </span>
        </div>

        {/* Screenshot */}
        <Image
          src={src}
          alt={alt}
          width={1920}
          height={1080}
          className="w-full h-auto pixelated"
          priority
        />
      </div>
    </motion.div>
  );
}
