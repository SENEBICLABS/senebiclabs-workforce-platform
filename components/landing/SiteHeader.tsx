"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
 * The row is a three-column grid, which is what keeps the links optically
 * centred regardless of how wide the brand or the call to action get. Centring
 * them with flex would shift them every time either side changed.
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
      <div className="grid h-[58px] grid-cols-[auto_1fr_auto] items-center px-4 md:h-[68px] md:px-6">
        <Link
          href="/"
          className="focusable flex items-center gap-2.5 rounded-btn text-[15px] font-medium tracking-[0.06em] text-ink"
        >
          <span className="grid h-[22px] w-[22px] place-items-center">
            <BrandMark />
          </span>
          Senebiclabs
        </Link>

        <nav
          aria-label="Main"
          className="hidden items-center justify-center gap-9 text-[15px] md:flex"
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

        <div className="flex items-center gap-3">
          {/* Mono, uppercase and tracked, on a white pill. The marketing site's
              call to action exactly, with the only verb this site has. */}
          <Link
            href="/login"
            className="focusable hidden rounded-full bg-accent px-[18px] py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-on-fill transition-colors hover:bg-accent-hover md:inline-block"
          >
            Sign in
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
            href="/login"
            onClick={() => setMenuOpen(false)}
            className="focusable mt-4 self-start rounded-full bg-accent px-[18px] py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-on-fill transition-colors hover:bg-accent-hover"
          >
            Sign in
          </Link>
        </nav>
      )}
    </header>
  );
}
