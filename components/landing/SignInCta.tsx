import Link from "next/link";
import { buttonClass } from "@/components/ui/button-class";

/**
 * The only action a visitor can take.
 *
 * There is no public application any more, so the pages do not offer one. A
 * clinician either holds an invitation, in which case the link in their inbox
 * is the way in, or they do not, in which case there is nothing here for them
 * to submit and pretending otherwise wastes their time.
 */
export function SignInCta() {
  return (
    <div className="flex flex-col items-center gap-3">
      <Link href="/login" className={buttonClass({ size: "lg" })}>
        Sign in
      </Link>
      <p className="text-[12px] text-muted">
        Already a member. Invitations arrive by email.
      </p>
    </div>
  );
}
