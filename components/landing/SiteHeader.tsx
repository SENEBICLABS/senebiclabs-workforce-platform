"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The public site's header.
 *
 * Two rows on small screens rather than a menu behind a button: with three
 * links there is nothing to hide, and a disclosure that needs JavaScript to
 * open is a worse trade than a second row.
 *
 * Internal links use Link so navigation is a client-side transition and the
 * routes are prefetched as they come into view.
 */

const NAV = [
  { href: "/about-us", label: "About us" },
  { href: "/our-experts", label: "Our experts" },
  { href: "/faqs", label: "FAQs" },
];

export function SiteHeader() {
  const pathname = usePathname();

  const linkClass = (href: string) => {
    const active = pathname === href;
    return `focusable rounded-btn px-2.5 py-1.5 text-body transition-colors ${
      active
        ? "font-medium text-accent"
        : "font-medium text-muted hover:text-ink"
    }`;
  };

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-surface/95 backdrop-blur">
      <div className="mx-auto max-w-[1100px] px-5 lg:px-8">
        {/* Row one: identity and the way in */}
        <div className="flex h-14 items-center justify-between gap-4">
          <Link
            href="/"
            className="focusable rounded-btn text-[15px] font-semibold tracking-tight text-ink"
          >
            Senebiclabs
          </Link>

          {/* Desktop: the whole nav sits inline */}
          <nav aria-label="Main" className="hidden md:flex md:items-center md:gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={pathname === item.href ? "page" : undefined}
                className={linkClass(item.href)}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <Link
            href="/login"
            className="focusable rounded-btn px-2.5 py-1.5 text-body font-medium text-ink transition-colors hover:text-accent"
          >
            Sign in
          </Link>
        </div>

        {/* Row two, small screens only */}
        <nav
          aria-label="Main"
          className="flex items-center gap-1 overflow-x-auto border-t border-hairline py-2 md:hidden"
        >
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
              className={`${linkClass(item.href)} whitespace-nowrap`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
