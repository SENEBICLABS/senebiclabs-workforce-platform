import React from "react";
import { AlertTriangle, Inbox, RotateCw, type LucideIcon } from "lucide-react";
import { Button } from "./Button";
import { IconBadge } from "./Card";

/**
 * Every list and screen resolves into exactly one of these three. There is no
 * fourth state where a blank page or a raw error reaches a clinician.
 */

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse-soft rounded-card border border-hairline-soft bg-surface ${className}`}
    />
  );
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
  icon: Icon = Inbox,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="animate-rise rounded-card border border-dashed border-hairline bg-surface/60 px-6 py-14 text-center">
      <div className="flex justify-center">
        <IconBadge size="lg">
          <Icon size={22} strokeWidth={1.75} />
        </IconBadge>
      </div>
      <h3 className="mt-5 text-section text-ink">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-body text-muted">{body}</p>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="animate-rise rounded-card border border-danger/30 bg-danger-soft/40 px-6 py-12 text-center"
    >
      <div className="flex justify-center">
        <IconBadge size="lg" tone="danger">
          <AlertTriangle size={22} strokeWidth={1.75} />
        </IconBadge>
      </div>
      <h3 className="mt-5 text-section text-ink">That did not load</h3>
      <p className="mx-auto mt-2 max-w-md text-body text-muted">{message}</p>
      <div className="mt-6 flex justify-center">
        <Button variant="secondary" onClick={onRetry}>
          <RotateCw size={15} aria-hidden="true" />
          Try again
        </Button>
      </div>
    </div>
  );
}
