import { FAQS, FAQ_CATEGORIES } from "@/lib/marketing-content";

/**
 * The FAQ accordion.
 *
 * Native details elements, so a question can be opened before JavaScript loads
 * and remains usable if it never does.
 */
function Item({ q, a }: { q: string; a: string }) {
  return (
    // No box and no rule. The plus sign carries the affordance and the spacing
    // does the separating, so an open question is the only thing that changes
    // shape when you click.
    <details className="group py-1">
      <summary className="focusable cursor-pointer list-none py-3 text-body font-semibold text-ink marker:hidden">
        <span className="flex items-center justify-between gap-4">
          {q}
          <span
            aria-hidden="true"
            className="shrink-0 text-accent transition-transform duration-150 group-open:rotate-45"
          >
            +
          </span>
        </span>
      </summary>
      <p className="pb-3 text-body leading-relaxed text-muted">{a}</p>
    </details>
  );
}

/** `featuredOnly` gives the landing its shortlist; the full page groups by category. */
export function Faqs({ featuredOnly = false }: { featuredOnly?: boolean }) {
  if (featuredOnly) {
    return (
      <div className="space-y-3">
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
            <h2 className="text-label uppercase text-muted">{category}</h2>
            <div className="mt-4 space-y-3">
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
