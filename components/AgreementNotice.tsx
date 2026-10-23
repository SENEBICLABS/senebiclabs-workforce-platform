"use client";

import Link from "next/link";
import { FileText } from "lucide-react";
import { useAppState } from "./AppState";
import { buttonClass } from "./ui/button-class";
import { IconBadge } from "./ui/Card";

/**
 * The one piece of setup a new member can have outstanding: the reviewer
 * agreement.
 *
 * An invitation creates the account and lands on /welcome, so nothing in the
 * flow ever took a member to /agreement, and the terms every page refers to
 * ("the agreement you accept when you join") were never put in front of them.
 * This says so wherever they land, from the same flag the account page shows.
 * It renders nothing once the agreement is accepted, and nothing while the
 * account is still loading, so it never flashes at someone who has accepted.
 */
export function AgreementNotice({ className = "" }: { className?: string }) {
  const { me } = useAppState();
  if (!me || me.agreement_accepted) return null;

  return (
    <div
      role="status"
      className={`flex flex-col gap-4 rounded-card border border-warning/30 bg-warning-soft p-5 sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      <div className="flex items-start gap-4">
        <IconBadge tone="warning">
          <FileText size={17} />
        </IconBadge>
        <div>
          <p className="text-[16px] font-semibold text-ink">
            Next step: read and accept the reviewer agreement
          </p>
          <p className="mt-1 text-[15px] text-strong">
            It sets out the work, confidentiality and how you are paid. Please accept
            it before you begin reviewing.
          </p>
        </div>
      </div>
      <Link href="/agreement" className={buttonClass({ className: "shrink-0" })}>
        Read the agreement
      </Link>
    </div>
  );
}
