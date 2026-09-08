import { FAQS, FAQ_CATEGORIES } from "@/lib/marketing-content";

/**
 * The FAQ accordion.
 *
 * Native details elements, so a question can be opened before JavaScript loads
 * and remains usable if it never does.
 */
function Item({ q, a }: { q: string; a: string }) {
  return (
    <details className="group rounded-card border border-hairline bg-surface">
      <summary className="focusable cursor-pointer list-none px-5 py-4 text-body font-semibold text-ink marker:hidden">
        <span className="flex items-center justify-between gap-4">
          {q}
          <span
            aria-hidden="true"
            className="shrink-0 text-muted transition-transform duration-150 group-open:rotate-45"
          >
            +
          </span>
        </span>
      </summary>
      {/* No rule between question and answer. The gap does the separating, and
          the footer's line is meant to be the only one on the site. */}
      <p className="px-5 pb-5 text-body leading-relaxed text-muted">{a}</p>
    </details>
  );
}

/** `featuredOnly` gives the landing its shortlist; the full page groups by category. */
export function Faqs({ featuredOnly = false }: { featuredOnly?: boolean }) {
  if (featuredOnly) {
    return (
      <div className="space-y-2.5">
        {FAQS.filter((f) => f.featured).map((f) => (
          <Item key={f.q} q={f.q} a={f.a} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {FAQ_CATEGORIES.map((category) => {
        const items = FAQS.filter((f) => f.category === category);
        if (items.length === 0) return null;

        return (
          <section key={category}>
            <h2 className="text-label uppercase text-accent">{category}</h2>
            <div className="mt-4 space-y-2.5">
              {items.map((f) => (
                <Item key={f.q} q={f.q} a={f.a} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
