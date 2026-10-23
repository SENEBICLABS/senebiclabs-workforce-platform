import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  /** Adds a 1px lift and a teal edge on hover. Use for cards you can click. */
  interactive?: boolean;
  /** Floats the card off the page: for the one card a signed-out page is. */
  elevated?: boolean;
}

export function Card({ children, className = "", interactive, elevated }: CardProps) {
  return (
    <div
      className={`rounded-card border border-hairline bg-surface ${elevated ? "shadow-pop" : "shadow-card"} ${
        interactive
          ? "transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-px hover:border-accent/45 hover:shadow-glow"
          : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function CardContent({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`p-5 sm:p-6 ${className}`}>{children}</div>;
}

/**
 * The strip across the top of a card that holds a title and, optionally, a
 * line under it and something to press. Divided from the body by the quieter
 * hairline, so a card reads as one object rather than two boxes.
 */
export function CardHeader({
  title,
  description,
  icon,
  action,
  className = "",
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-wrap items-start justify-between gap-3 border-b border-hairline-soft px-5 py-4 sm:px-6 ${className}`}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon && <IconBadge>{icon}</IconBadge>}
        <div className="min-w-0">
          <h2 className="text-section text-ink">{title}</h2>
          {description && (
            <p className="mt-1 text-[15px] leading-snug text-muted">{description}</p>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}

/** A small recessed square for an icon, so icons sit on something rather than float. */
export function IconBadge({
  children,
  tone = "accent",
  size = "md",
}: {
  children: React.ReactNode;
  tone?: "accent" | "neutral" | "warning" | "danger";
  size?: "md" | "lg";
}) {
  const tones = {
    accent: "bg-accent-soft text-accent ring-accent/25",
    neutral: "bg-surface-raised text-muted ring-hairline",
    warning: "bg-warning-soft text-warning ring-warning/25",
    danger: "bg-danger-soft text-danger ring-danger/25",
  };
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-btn ring-1 ring-inset ${tones[tone]} ${
        size === "lg" ? "h-12 w-12" : "h-9 w-9"
      }`}
    >
      {children}
    </span>
  );
}

export function SectionHeading({
  children,
  description,
  action,
}: {
  children: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h2 className="text-section text-ink">{children}</h2>
        {description && (
          <p className="mt-1 text-[15px] text-muted">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
