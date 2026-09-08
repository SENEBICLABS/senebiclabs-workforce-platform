"use client";

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Announced to screen readers; the visible text lives beside the switch. */
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`focusable relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150 ${
        checked ? "bg-accent" : "bg-hairline"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow-sm transition-[left] duration-150 ${
          checked ? "left-[18px]" : "left-0.5"
        }`}
      />
    </button>
  );
}
