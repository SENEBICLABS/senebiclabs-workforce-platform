import Link from "next/link";
import { buttonClass } from "@/components/ui/button-class";
import { Arrow } from "./Arrow";

/**
 * The call to action that closes every public page: a link to /request-access
 * dressed as the white button with an arrow, matching the one in the nav.
 * Server-safe, so pages can render it without becoming client components.
 */
export function RequestAccessButton({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/request-access"
      className={buttonClass({ size: "lg", className: `group h-14 px-9 text-[17px] ${className}` })}
    >
      Request access
      <Arrow />
    </Link>
  );
}
