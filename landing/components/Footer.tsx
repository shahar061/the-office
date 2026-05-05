import type { Dictionary } from "@/lib/i18n/dictionaries";

interface Props {
  dict: Dictionary["footer"];
}

export function Footer({ dict }: Props) {
  return (
    <footer className="bg-bg-dark border-t border-surface py-8 px-6">
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
        {/* Left */}
        <div className="text-center sm:text-start">
          <p className="font-pixel text-[10px] text-text-muted tracking-widest">
            pixel.team
          </p>
          <p className="text-text-dim text-xs mt-1">{dict.tagline}</p>
        </div>

        {/* Right */}
        <div className="flex gap-6">
          <a
            href="https://github.com/shahar061/the-office"
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-muted text-sm hover:text-text-primary transition-colors"
          >
            {dict.github}
          </a>
          <a
            href="https://github.com/shahar061/the-office#readme"
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-muted text-sm hover:text-text-primary transition-colors"
          >
            {dict.docs}
          </a>
        </div>
      </div>
    </footer>
  );
}
