"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Arrow } from "./Arrow";
import { BrandMark } from "./BrandMark";

/**
 * The public site's header, matched to senebiclabs.com.
 *
 * A floating pill rather than a full-width bar: fixed with a gap on all three
 * sides, rounded, and blurred over whatever scrolls beneath it. The values here
 * are the marketing site's own, so the two properties read as one company
 * rather than as a product that happens to share a name.
 *
 *   at rest      black at 30%, no border
 *   scrolled     black at 72%, a hairline, and a shadow to lift it off the page
 *
 * The row is a 1fr / auto / 1fr grid, which keeps the links centred on the page
 * rather than in whatever space the brand leaves. The outer columns are always
 * equal, so there is nothing for the links to be pushed off-centre by — which
 * matters now there is nothing on the right on desktop.
 *
 * The one call to action is Request access, and the absence of a sign-in link
 * is deliberate. These pages are written for people without an account, so a
 * sign-in button would ask every reader to do the one thing they cannot.
 * Requesting access is something they can do: it tells us who they are, and an
 * operator decides whether to invite them. Members come back through a
 * bookmarked dashboard, which redirects to sign-in when a session has lapsed.
 *
 * Request access is a link to its own page, /request-access, not a dialog, so
 * it has a URL that can be shared and opened directly.
 */

const NAV = [
  { href: "/about-us", label: "About us" },
  { href: "/our-experts", label: "Our experts" },
  { href: "/faqs", label: "FAQs" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    // The first read is deferred to the next frame rather than run inline.
    // Setting state synchronously in an effect body forces a second render
    // pass in the same commit, which is what react-hooks/set-state-in-effect
    // is warning about; a page loaded already scrolled still resolves before
    // anything is painted.
    const first = requestAnimationFrame(onScroll);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(first);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <header
      className={`fixed inset-x-4 top-3 z-50 rounded-[14px] backdrop-blur-[16px] transition-[background-color,border-color,box-shadow] duration-200 md:inset-x-10 md:top-5 ${
        scrolled
          ? "border border-white/[0.06] bg-black/[0.72] shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.04)]"
          : "border border-transparent bg-black/30"
      }`}
    >
      <div className="grid h-[58px] grid-cols-[1fr_auto_1fr] items-center px-4 md:h-[68px] md:px-6">
        <Link
          href="/"
          className="focusable flex items-center gap-2.5 justify-self-start rounded-btn text-[16px] font-medium tracking-[0.06em] text-ink"
        >
          <span className="grid h-[22px] w-[22px] place-items-center">
            <BrandMark />
          </span>
          Senebiclabs
        </Link>

        <nav
          aria-label="Main"
          className="hidden items-center justify-center gap-9 text-[16px] md:flex"
        >
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
              className={`focusable rounded-btn transition-colors ${
                pathname === item.href ? "text-accent" : "text-muted hover:text-accent"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Pinned to the third column. On mobile the centre nav is display:none,
            which takes it out of the grid, and without this the actions would
            slide into the empty middle column beside the brand. */}
        <div className="col-start-3 flex items-center gap-3 justify-self-end">
          {/* Mono, uppercase and tracked on a white pill with an arrow: the one
              thing a reader here can actually do, as the brightest thing in the
              nav. */}
          <Link
            href="/request-access"
            aria-current={pathname === "/request-access" ? "page" : undefined}
            className="focusable group hidden items-center gap-1.5 rounded-full bg-ink px-[18px] py-2 font-mono text-[12px] uppercase tracking-[0.12em] text-canvas transition-colors hover:bg-strong md:inline-flex"
          >
            Request access
            <Arrow />
          </Link>

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className="focusable flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-hairline bg-transparent text-ink transition-colors hover:border-accent hover:bg-accent-soft md:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              {menuOpen ? (
                <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              ) : (
                <path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav
          aria-label="Main"
          className="flex flex-col border-t border-hairline px-4 pb-4 pt-2 md:hidden"
        >
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
              onClick={() => setMenuOpen(false)}
              className={`focusable rounded-btn border-b border-hairline py-3 text-body last:border-b-0 ${
                pathname === item.href ? "text-ink" : "text-muted"
              }`}
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/request-access"
            aria-current={pathname === "/request-access" ? "page" : undefined}
            onClick={() => setMenuOpen(false)}
            className="focusable group mt-4 inline-flex items-center gap-1.5 self-start rounded-full bg-ink px-[18px] py-2 font-mono text-[12px] uppercase tracking-[0.12em] text-canvas transition-colors hover:bg-strong"
          >
            Request access
            <Arrow />
          </Link>
        </nav>
      )}
    </header>
  );
}
