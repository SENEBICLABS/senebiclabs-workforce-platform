import React from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

type Tone = "danger" | "warning" | "info" | "success";

const TONE: Record<Tone, { box: string; icon: string; Icon: typeof Info }> = {
  danger: { box: "border-danger/35 bg-danger-soft/70", icon: "text-danger", Icon: XCircle },
  warning: { box: "border-warning/35 bg-warning-soft/70", icon: "text-warning", Icon: AlertTriangle },
  info: { box: "border-info/30 bg-info-soft/60", icon: "text-info", Icon: Info },
  success: { box: "border-success/30 bg-success-soft/60", icon: "text-success", Icon: CheckCircle2 },
};

/**
 * A message inside a page: a failed save, a bounce from sign-in, a warning
 * before something irreversible. The role is the caller's to choose, because
 * only the caller knows whether it should interrupt.
 */
export function Alert({
  tone = "info",
  title,
  children,
  role,
  id,
  className = "",
}: {
  tone?: Tone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  role?: "alert" | "status";
  id?: string;
  className?: string;
}) {
  const { box, icon, Icon } = TONE[tone];
  return (
    <div
      id={id}
      role={role}
      className={`flex gap-3 rounded-btn border px-4 py-3 text-left ${box} ${className}`}
    >
      <Icon size={18} aria-hidden="true" className={`mt-0.5 shrink-0 ${icon}`} />
      <div className="min-w-0 text-[15px] leading-snug">
        {title && <p className="font-semibold text-ink">{title}</p>}
        {children && <div className={title ? "mt-1 text-muted" : "text-strong"}>{children}</div>}
      </div>
    </div>
  );
}
