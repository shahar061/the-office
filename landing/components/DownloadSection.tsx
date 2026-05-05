import { RELEASE } from "@/lib/release";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { PrimaryDownloadButton } from "./PrimaryDownloadButton";
import ScrollReveal from "./ScrollReveal";

interface Props {
  dict: Dictionary["download"];
  locale: string;
}

export function DownloadSection({ dict, locale }: Props) {
  const { macArm64, macIntel, windows, linux } = RELEASE.assets;
  const releasedDate = new Date(RELEASE.releasedOn).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <section
      id="download"
      className="py-24 px-6 bg-[radial-gradient(ellipse_at_center,#1a1a2e_0%,#0f0f1a_70%)]"
    >
      <div className="max-w-2xl mx-auto text-center">
        <ScrollReveal>
          {/* Version pill */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface/60 border border-border text-text-secondary text-xs font-mono mb-5">
            <span className="text-accent-amber">{RELEASE.version}</span>
            <span className="text-text-dim">·</span>
            <span>
              {dict.released} {releasedDate}
            </span>
          </div>

          <h2 className="text-3xl md:text-4xl font-bold text-text-primary">
            {dict.headline}
          </h2>
          <p className="text-text-secondary text-[17px] mt-3">
            {dict.subheadline}
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.15}>
          {/* Primary download button — auto-detects OS, falls back to anchor */}
          <div className="mt-10 flex flex-col items-center gap-3">
            <PrimaryDownloadButton
              labelPrefix={dict.primaryLabelPrefix}
              fallbackLabel={dict.primaryFallback}
              className="bg-accent-blue text-white text-[17px] font-semibold px-8 py-4 rounded-xl hover:shadow-[0_0_30px_rgba(59,130,246,0.4)] transition-shadow"
            />
            <a
              href={macIntel.url}
              download
              className="text-text-dim text-sm hover:text-text-secondary transition-colors"
            >
              {dict.intelMacFallback}
            </a>
          </div>

          {/* Beta warning */}
          <p className="text-text-dim text-sm mt-6 max-w-md mx-auto leading-relaxed">
            {dict.betaWarning}
          </p>
        </ScrollReveal>

        {/* All builds */}
        <ScrollReveal delay={0.3}>
          <div className="mt-12">
            <p className="text-text-secondary text-sm uppercase tracking-wider mb-4">
              {dict.allBuilds}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-start">
              <PlatformCard asset={macArm64} note={dict.platformNotes.macArm64} />
              <PlatformCard asset={macIntel} note={dict.platformNotes.macIntel} />
              <PlatformCard asset={windows} note={dict.platformNotes.windows} />
              <PlatformCard asset={linux} note={dict.platformNotes.linux} />
            </div>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.45}>
          <a
            href={RELEASE.releasesUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-10 text-text-secondary text-sm hover:text-text-primary transition-colors"
          >
            {dict.viewAllReleases}
          </a>
        </ScrollReveal>
      </div>
    </section>
  );
}

function PlatformCard({
  asset,
  note,
}: {
  asset: (typeof RELEASE.assets)[keyof typeof RELEASE.assets];
  note: string;
}) {
  return (
    <a
      href={asset.url}
      download
      className="group block bg-surface/60 border border-border rounded-xl px-4 py-3 hover:border-accent-blue/40 hover:bg-surface transition-colors"
    >
      <div className="text-text-primary text-sm font-semibold group-hover:text-accent-blue transition-colors">
        {asset.os}
      </div>
      <div className="text-text-dim text-xs mt-0.5">
        {asset.arch} &middot; {note}
      </div>
    </a>
  );
}
