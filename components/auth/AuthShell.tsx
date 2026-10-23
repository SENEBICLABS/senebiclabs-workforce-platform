import Link from "next/link";
import { BrandMark } from "@/components/landing/BrandMark";
import React from "react";

/** The brand lockup the signed-out pages open with. */
function Lockup() {
  return (
    <Link
      href="/"
      className="focusable inline-flex items-center gap-2.5 rounded-btn text-[17px] font-semibold tracking-[0.04em] text-ink"
    >
      <span className="grid h-9 w-9 place-items-center rounded-btn bg-accent-soft text-accent ring-1 ring-inset ring-accent/30">
        <BrandMark size={18} />
      </span>
      Senebiclabs
    </Link>
  );
}

/**
 * The centred frame every signed-out page sits in.
 *
 * It carries the same teal wash as the public site, so stepping from the
 * landing page to sign-in does not feel like leaving it.
 */
export function AuthShell({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="ground-blend flex min-h-screen flex-col items-center justify-center px-4 py-12 sm:px-5">
      <div className="w-full max-w-[440px]">
        <div className="mb-8 text-center">
          <Lockup />
          <p className="mt-3 text-[15px] text-muted">Clinical review platform</p>
        </div>
        <div className="animate-rise">{children}</div>
        {footer && (
          <p className="mt-6 text-center text-[14px] leading-relaxed text-subtle">{footer}</p>
        )}
      </div>
    </div>
  );
}

/**
 * The wider frame for the steps after an invitation: the agreement and the
 * welcome. The brand sits at the top-left rather than centred over a card,
 * because these pages are read rather than filled in.
 */
export function OnboardingShell({
  children,
  step,
  width = "md",
}: {
  children: React.ReactNode;
  /** 1-based; omitted on pages that are not part of the sequence. */
  step?: number;
  width?: "sm" | "md";
}) {
  return (
    <div className="ground-blend min-h-screen px-4 pb-16 pt-6 sm:px-6">
      <div className="mx-auto flex max-w-[960px] items-center justify-between">
        <Lockup />
        {step && <Steps current={step} total={3} />}
      </div>
      <div
        className={`animate-rise mx-auto mt-12 w-full sm:mt-16 ${
          width === "sm" ? "max-w-[560px]" : "max-w-[680px]"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

/** Where someone is in joining, as segments and a number. */
export function Steps({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-3" aria-label={`Step ${current} of ${total}`}>
      <div aria-hidden="true" className="flex gap-1.5">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i < current ? "w-6 bg-accent" : "w-3 bg-hairline-strong"
            }`}
          />
        ))}
      </div>
      <span className="tnum text-label uppercase text-subtle">
        Step {current} of {total}
      </span>
    </div>
  );
}

/** Google's mark, inline so the button needs no external asset. */
export function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"/>
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"/>
    </svg>
  );
}

export function GoogleButton({
  href,
  label = "Continue with Google",
}: {
  href: string;
  label?: string;
}) {
  return (
    <a
      href={href}
      className="focusable flex h-12 w-full items-center justify-center gap-2.5 rounded-btn border border-hairline-strong bg-surface-raised text-[15px] font-semibold text-ink transition-colors hover:border-accent/60 hover:bg-accent-soft active:translate-y-px"
    >
      <GoogleMark />
      {label}
    </a>
  );
}

export function OrDivider() {
  return (
    <div className="my-6 flex items-center gap-3">
      <span className="h-px flex-1 bg-hairline-soft" />
      <span className="text-label uppercase text-subtle">or</span>
      <span className="h-px flex-1 bg-hairline-soft" />
    </div>
  );
}
