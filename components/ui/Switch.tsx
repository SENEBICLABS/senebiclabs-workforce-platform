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
      className={`focusable relative h-6 w-11 shrink-0 rounded-full ring-1 ring-inset transition-colors duration-150 ${
        checked ? "bg-accent ring-accent" : "bg-surface-raised ring-hairline-strong"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-1 h-4 w-4 rounded-full shadow-[0_1px_3px_rgb(0_0_0/0.5)] transition-[left,background-color] duration-150 ${
          checked ? "left-6 bg-on-fill" : "left-1 bg-muted"
        }`}
      />
    </button>
  );
}
