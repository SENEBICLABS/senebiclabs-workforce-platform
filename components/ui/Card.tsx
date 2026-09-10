import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  /** Adds a 1px lift and soft shadow on hover. Use for cards you can click. */
  interactive?: boolean;
}

export function Card({ children, className = "", interactive }: CardProps) {
  return (
    <div
      className={`rounded-card border border-hairline bg-surface ${
        interactive
          ? "transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-px hover:border-accent/40 hover:shadow-[0_4px_18px_rgba(79,191,164,0.10)]"
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
  return <div className={`p-5 ${className}`}>{children}</div>;
}

export function SectionHeading({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4">
      <h2 className="text-section text-ink">{children}</h2>
      {action}
    </div>
  );
}
