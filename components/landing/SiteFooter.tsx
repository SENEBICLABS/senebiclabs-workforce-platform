import Link from "next/link";

/**
 * The public site's footer. Mirrors the header's routes so nothing is orphaned.
 *
 * This rule is the only one on the public site. The pages run as one unbroken
 * ground, so the single line here is what marks the end of the page rather than
 * one seam among many.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto max-w-[1100px] px-5 py-10 text-center lg:px-8">
        <p className="text-[15px] font-bold tracking-tight text-ink">
          Senebiclabs
        </p>
        <p className="mt-1 text-[13px] text-muted">
          Clinical review platform for licensed clinicians
        </p>

        <nav
          aria-label="Footer"
          className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2"
        >
          {[
            { href: "/about-us", label: "About us" },
            { href: "/our-experts", label: "Our experts" },
            { href: "/faqs", label: "FAQs" },
            { href: "/login", label: "Sign in" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="focusable rounded-btn text-[13px] text-muted transition-colors hover:text-accent"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
