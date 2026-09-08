import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";

/**
 * Chrome for the public pages.
 *
 * A route group, so these share a header and footer without adding a segment to
 * any URL and without touching the signed-in application, which has its own
 * shell and must not inherit this one.
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-surface">
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
