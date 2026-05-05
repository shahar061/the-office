"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { AGENTS } from "@/lib/constants";
import type { Dictionary } from "@/lib/i18n/dictionaries";

/* ── internal sub-components ─────────────────────────────── */

function AgentCard({
  name,
  color,
  role,
  delay,
  large,
}: {
  name: string;
  color: string;
  role: string;
  delay: number;
  large?: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      className={`bg-surface border rounded-lg ${
        large ? "px-5 py-3" : "px-3.5 py-2.5"
      }`}
      style={{
        borderColor: hovered ? color : "#2a2a3a",
        boxShadow: hovered ? `0 0 16px ${color}25` : "none",
      }}
      initial={{ opacity: 0, y: -10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.3 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-center gap-2">
        {/* coloured dot */}
        <motion.div
          className={`rounded-full ${large ? "w-2 h-2" : "w-1.5 h-1.5"}`}
          style={{ backgroundColor: color }}
          whileInView={{ scale: [1, 1.5, 1] }}
          viewport={{ once: true }}
          transition={{ delay, duration: 0.6 }}
        />

        <span
          className={
            large
              ? "text-sm font-semibold text-text-primary"
              : "text-[11px] text-text-secondary"
          }
        >
          {name}
        </span>
      </div>

      {/* expandable role */}
      <motion.p
        className="text-text-dim text-[10px] mt-1"
        animate={{ height: hovered ? "auto" : 0, opacity: hovered ? 1 : 0 }}
        initial={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.2 }}
        style={{ overflow: "hidden" }}
      >
        {role}
      </motion.p>
    </motion.div>
  );
}

function ConnectorLine() {
  return (
    <div className="flex justify-center">
      <motion.div
        className="w-px bg-border"
        style={{ height: 20 }}
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.3 }}
      />
    </div>
  );
}

function HorizontalLine() {
  return (
    <div className="flex justify-center">
      <motion.div
        className="h-px bg-border"
        style={{ width: "60%" }}
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4 }}
      />
    </div>
  );
}

/* ── main component ──────────────────────────────────────── */

const leadership = AGENTS[0].agents;
const coordination = AGENTS[1].agents;
const engineering = AGENTS[2].agents;

export function OrgChart({ dict }: { dict: Dictionary["orgChart"] }) {
  const ceo = leadership[0];
  const leadershipRest = leadership.slice(1);

  return (
    <section className="py-24 px-6 bg-bg-dark overflow-hidden relative">
      {/* vignette overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,#0d0d1a_75%)] pointer-events-none z-10" />

      {/* content */}
      <div className="relative z-20 max-w-3xl mx-auto">
        {/* header */}
        <div className="text-center mb-12">
          <p className="font-pixel text-[10px] tracking-[3px] text-text-muted uppercase mb-4">
            {dict.label}
          </p>
          <h2 className="text-3xl md:text-4xl font-extrabold text-text-primary mb-4">
            {dict.headline}
          </h2>
          <p className="text-text-secondary text-lg max-w-xl mx-auto">
            {dict.subheadline}
          </p>
        </div>

        {/* org chart */}
        <div className="flex flex-col items-center gap-0">
          {/* CEO */}
          <AgentCard
            name={ceo.name}
            color={ceo.color}
            role={ceo.role}
            delay={0}
            large
          />

          <ConnectorLine />

          {/* leadership row */}
          <div className="flex flex-wrap justify-center gap-2">
            {leadershipRest.map((agent, i) => (
              <AgentCard
                key={agent.name}
                name={agent.name}
                color={agent.color}
                role={agent.role}
                delay={0.3 + i * 0.06}
              />
            ))}
          </div>

          <HorizontalLine />
          <ConnectorLine />

          {/* coordination row */}
          <div className="flex flex-wrap justify-center gap-2">
            {coordination.map((agent, i) => (
              <AgentCard
                key={agent.name}
                name={agent.name}
                color={agent.color}
                role={agent.role}
                delay={0.7 + i * 0.06}
              />
            ))}
          </div>

          <HorizontalLine />
          <ConnectorLine />

          {/* engineering row */}
          <div className="flex flex-wrap justify-center gap-2">
            {engineering.map((agent, i) => (
              <AgentCard
                key={agent.name}
                name={agent.name}
                color={agent.color}
                role={agent.role}
                delay={1.0 + i * 0.06}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
