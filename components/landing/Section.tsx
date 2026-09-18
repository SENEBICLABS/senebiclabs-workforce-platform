/**
 * The public pages' layout primitives.
 *
 * These exist because the pages had drifted into five heading sizes, fourteen
 * content widths and two section paddings, all set by hand. On a page carried
 * entirely by type, that inconsistency is the whole difference between
 * restrained and unfinished: there is no card or icon left to hide behind, so
 * the rhythm has to be exact.
 *
 * The scale is deliberately small. Three type sizes, three measures, one
 * vertical rhythm. Anything that needs a fourth is usually a sign the section
 * is trying to do two jobs.
 */

/** Page shell. One width for every section, so edges line up down the page. */
const SHELL = "mx-auto w-full max-w-[1280px] px-5 lg:px-10";
/** For a section carrying a panel rather than prose: nearly the full window. */
const SHELL_WIDE = "mx-auto w-full max-w-[1560px] px-5 lg:px-10";

/**
 * Measures, in the order they narrow. A line of text wants roughly 60 to 75
 * characters; these are tuned to land there at the size each one is used at.
 */
export const MEASURE = {
  /** Long-form prose. */
  prose: "mx-auto max-w-[640px]",
  /** The line under a section heading. Shorter, so it reads as a subtitle. */
  intro: "mx-auto max-w-[560px]",
  /** Display headlines, which want to break earlier than prose does. */
  display: "mx-auto max-w-[880px]",
};

export function Section({
  children,
  className = "",
  tight = false,
  wide = false,
}: {
  children: React.ReactNode;
  className?: string;
  /** For sections that sit directly under another, sharing one breath. */
  tight?: boolean;
  /** For a section built around a panel, which wants the window, not a column. */
  wide?: boolean;
}) {
  return (
    <section className={className}>
      <div className={`${wide ? SHELL_WIDE : SHELL} ${tight ? "py-14 sm:py-16" : "py-20 sm:py-28"}`}>
        {children}
      </div>
    </section>
  );
}

/** The hero. Taller than any other section, which is most of what marks it. */
export function Hero({ children }: { children: React.ReactNode }) {
  return (
    <section>
      <div className={`${SHELL} py-24 text-center sm:py-32 lg:py-40`}>
        {children}
      </div>
    </section>
  );
}

/**
 * Eyebrow, heading and optional intro, always in that order and always at the
 * same sizes. Every section on the public site opens with one of these, which
 * is what gives the pages a spine now that nothing is boxed.
 */
export function SectionHead({
  eyebrow,
  title,
  intro,
  display = false,
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
  /** Hero scale. One per page at most. */
  display?: boolean;
}) {
  const Heading = display ? "h1" : "h2";
  const size = display
    ? "text-[42px] leading-[1.04] sm:text-[60px]"
    : "text-[30px] leading-[1.1] sm:text-[38px]";

  return (
    <div className="text-center">
      {eyebrow && <p className="text-label uppercase text-muted">{eyebrow}</p>}
      <Heading
        className={`${MEASURE.display} ${eyebrow ? "mt-5" : ""} ${size} text-ink`}
      >
        {title}
      </Heading>
      {intro && (
        <p className={`${MEASURE.intro} mt-5 text-[19px] leading-relaxed text-muted`}>
          {intro}
        </p>
      )}
    </div>
  );
}

/**
 * A grid item.
 *
 * The index is what replaced the icon. It anchors the item and gives the row a
 * beat, but it is type rather than ornament, so it carries the same weight as
 * everything else on the page instead of competing with it.
 */
export function GridItem({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="text-center">
      <p aria-hidden="true" className="tnum text-label text-accent">
        {String(index).padStart(2, "0")}
      </p>
      <h3 className="mt-4 text-[19px] leading-snug text-ink">{title}</h3>
      <p className="mt-2 text-body leading-relaxed text-muted">{children}</p>
    </div>
  );
}

/** Three across on desktop, with the air an unboxed grid needs. */
export function Grid({
  children,
  cols = 3,
}: {
  children: React.ReactNode;
  cols?: 2 | 3;
}) {
  return (
    <div
      className={`mt-14 grid grid-cols-1 gap-x-10 gap-y-12 ${
        cols === 3 ? "md:grid-cols-3" : "md:grid-cols-2"
      }`}
    >
      {children}
    </div>
  );
}
