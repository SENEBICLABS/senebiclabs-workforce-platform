import React from "react";
import type { PoolStatus, Purpose } from "@/lib/api";

type Tone = "accent" | "success" | "info" | "warning" | "neutral";

const TONE: Record<Tone, string> = {
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
  neutral: "bg-canvas text-muted",
};

export function Pill({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-label uppercase ${TONE[tone]} ${className}`}
    >
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
  not_started: "neutral",
  in_progress: "accent",
};

const STATUS_LABEL: Record<PoolStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
};

export function StatusPill({ status }: { status: PoolStatus }) {
  return <Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Pill>;
}
