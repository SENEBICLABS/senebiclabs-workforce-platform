import React from "react";
import type { PoolStatus, Purpose } from "@/lib/api";

type Tone = "accent" | "success" | "info" | "warning" | "neutral";

const TONE: Record<Tone, string> = {
  accent: "bg-accent-soft text-accent ring-accent/25",
  success: "bg-success-soft text-success ring-success/25",
  info: "bg-info-soft text-info ring-info/25",
  warning: "bg-warning-soft text-warning ring-warning/25",
  neutral: "bg-surface-raised text-muted ring-hairline",
};

/** The dot a status pill leads with, so state reads before the word does. */
const DOT: Record<Tone, string> = {
  accent: "bg-accent",
  success: "bg-success",
  info: "bg-info",
  warning: "bg-warning",
  neutral: "bg-subtle",
};

export function Pill({
  tone = "neutral",
  dot = false,
  children,
  className = "",
}: {
  tone?: Tone;
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-label uppercase ring-1 ring-inset ${TONE[tone]} ${className}`}
    >
      {dot && <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOT[tone]}`} />}
      {children}
    </span>
  );
}

const PURPOSE_TONE: Record<Purpose, Tone> = {
  evaluate: "accent",
  label: "info",
  create: "warning",
};

const PURPOSE_LABEL: Record<Purpose, string> = {
  evaluate: "Evaluate",
  label: "Label",
  create: "Create",
};

export function PurposeBadge({ purpose }: { purpose: Purpose }) {
  return <Pill tone={PURPOSE_TONE[purpose]}>{PURPOSE_LABEL[purpose]}</Pill>;
}

const STATUS_TONE: Record<PoolStatus, Tone> = {
  closed: "neutral",
  available: "accent",
  up_to_date: "neutral",
  none_available: "neutral",
  unknown: "neutral",
};

const STATUS_LABEL: Record<PoolStatus, string> = {
  closed: "Closed",
  available: "Open",
  up_to_date: "Up to date",
  none_available: "Nothing available",
  unknown: "Unavailable",
};

export function StatusPill({ status }: { status: PoolStatus }) {
  return (
    <Pill tone={STATUS_TONE[status]} dot>
      {STATUS_LABEL[status]}
    </Pill>
  );
}
