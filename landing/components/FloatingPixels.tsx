"use client";

import { useMemo } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

const AGENT_COLORS = [
  "#3b82f6",
  "#14b8a6",
  "#22c55e",
  "#f97316",
  "#a855f7",
  "#0ea5e9",
  "#f59e0b",
  "#10b981",
  "#6366f1",
  "#8b5cf6",
  "#f43f5e",
  "#06b6d4",
  "#ef4444",
  "#ec4899",
  "#9ca3af",
];

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  opacity: number;
  duration: number;
  delay: number;
}

export default function FloatingPixels() {
  const { scrollYProgress } = useScroll();
  const parallaxY = useTransform(scrollYProgress, [0, 1], [0, -200]);

  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() > 0.5 ? 3 : 2,
      color: AGENT_COLORS[Math.floor(Math.random() * AGENT_COLORS.length)],
      opacity: 0.1 + Math.random() * 0.2,
      duration: 5 + Math.random() * 4,
      delay: Math.random() * 5,
    }));
  }, []);

  return (
    <motion.div
      className="fixed inset-0 z-0 pointer-events-none"
      style={{ y: parallaxY }}
    >
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute rounded-full"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            width: particle.size,
            height: particle.size,
            backgroundColor: particle.color,
            opacity: particle.opacity,
          }}
          animate={{
            y: [0, -20, 0],
            x: [0, 10, 0],
          }}
          transition={{
            duration: particle.duration,
            delay: particle.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </motion.div>
  );
}
