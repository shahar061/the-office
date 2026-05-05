import type { Dictionary } from "@/lib/i18n/dictionaries";
import ScrollReveal from "./ScrollReveal";

interface Props {
  dict: Dictionary["mobile"];
}

export function MobileSection({ dict }: Props) {
  return (
    <section className="py-20 px-6">
      <div className="max-w-3xl mx-auto flex flex-col md:flex-row items-center gap-10">
        {/* Phone mockup */}
        <ScrollReveal direction="left" distance={40}>
          <div
            className="w-40"
            style={{ animation: "phone-float 4s ease-in-out infinite" }}
          >
            <div className="bg-surface border-2 border-border rounded-[20px] p-2">
              <div className="bg-bg rounded-[14px] px-3 py-5 min-h-[200px] flex flex-col items-center justify-center">
                {/* Notch */}
                <div className="w-8 h-[3px] bg-border rounded-full mb-4" />
                <p className="font-pixel text-[8px] text-text-muted">
                  PIXEL.TEAM
                </p>
                <div className="flex gap-1 mt-3">
                  <span className="w-1 h-1 rounded-full bg-accent-blue" />
                  <span className="w-1 h-1 rounded-full bg-accent-green" />
                  <span className="w-1 h-1 rounded-full bg-accent-amber" />
                </div>
                <p className="text-text-dim text-[9px] mt-2">Live session</p>
              </div>
            </div>
          </div>
        </ScrollReveal>

        {/* Text side */}
        <ScrollReveal direction="right" distance={40} delay={0.15}>
          <div>
            <div className="flex items-center gap-3 mb-3">
              <p className="font-pixel text-[9px] tracking-[3px] text-accent-blue uppercase">
                {dict.label}
              </p>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-accent-amber/10 border border-accent-amber/30 text-accent-amber text-[10px] font-mono uppercase tracking-wider">
                {dict.comingSoonBadge}
              </span>
            </div>
            <h3 className="text-text-primary text-2xl font-bold mb-3">
              {dict.headline}
            </h3>
            <p className="text-text-secondary text-[15px] leading-relaxed">
              {dict.description}{" "}
              <span className="text-text-dim">{dict.inDevelopment}</span>
            </p>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
