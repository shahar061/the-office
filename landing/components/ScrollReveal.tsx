"use client";

import { motion } from "framer-motion";

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: "up" | "left" | "right";
  distance?: number;
}

export default function ScrollReveal({
  children,
  className,
  delay = 0,
  direction = "up",
  distance = 20,
}: ScrollRevealProps) {
  const initialX = direction === "left" ? -distance : direction === "right" ? distance : 0;
  const initialY = direction === "up" ? distance : 0;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, x: initialX, y: initialY }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, ease: "easeOut", delay }}
    >
      {children}
    </motion.div>
  );
}
