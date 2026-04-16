import ScrollReveal from "./ScrollReveal";

export function WorkshopCallout() {
  return (
    <section className="py-12 px-6">
      <ScrollReveal>
        <div className="max-w-2xl mx-auto relative bg-gradient-to-br from-surface to-surface-light border border-border rounded-2xl p-9 overflow-hidden">
          {/* Purple left border */}
          <div className="absolute top-0 left-0 w-[3px] h-full bg-gradient-to-b from-accent-purple to-[#6366f1]" />

          <div className="flex gap-6 items-start pl-4">
            <span className="text-3xl flex-shrink-0">&#x26A1;</span>
            <div>
              <h3 className="text-text-primary text-xl font-semibold mb-2">
                Need something quick? Use Workshop.
              </h3>
              <p className="text-text-secondary text-[15px] leading-relaxed">
                Not every idea needs a full production. Workshop mode lets you
                spin up a single-prompt build -- perfect for prototypes, landing
                pages, or quick experiments. No team, no phases, just results.
              </p>
            </div>
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}
