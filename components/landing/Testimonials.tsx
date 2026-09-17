
/**
 * Clinician quotes.
 *
 * Empty until real ones exist. The section renders nothing while the list is
 * empty, so the page never ships an invented quote or a visible placeholder.
 *
 * To add one, append an entry below. Each needs a real clinician who has agreed
 * to be quoted by name and specialty.
 */
export interface Quote {
  quote: string;
  name: string;
  credential: string;
  specialty: string;
}

export const QUOTES: Quote[] = [
  // { quote: "…", name: "Dr …", credential: "MD", specialty: "Internal medicine" },
];

export function Testimonials() {
  if (QUOTES.length === 0) return null;

  return (
    <section>
      <div className="mx-auto max-w-[1100px] px-5 py-16 lg:px-8">
        <h2 className="text-center text-[26px] font-bold leading-tight text-ink">
          From clinicians on the platform
        </h2>

        <div className="mt-12 grid grid-cols-1 gap-x-8 gap-y-12 md:grid-cols-2 lg:grid-cols-3">
          {QUOTES.map((q) => (
            <div key={q.name}>
              <blockquote className="text-body leading-relaxed text-ink">
                {q.quote}
              </blockquote>
              <footer className="mt-5">
                <p className="text-body font-semibold text-ink">{q.name}</p>
                <p className="text-[15px] text-muted">
                  {q.credential}, {q.specialty}
                </p>
              </footer>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
