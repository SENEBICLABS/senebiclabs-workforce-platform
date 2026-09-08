import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";

/**
 * Chrome for the public pages.
 *
 * A route group, so these share a header and footer without adding a segment to
 * any URL and without touching the signed-in application, which has its own
 * shell and must not inherit this one.
 *
 * One ground the whole way down. The pages carry no section rules and no
 * alternating bands, so the teal runs unbroken from the header to the footer
 * and the cards are the only edges on the page. The single line on the site is
 * the one above the footer.
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
