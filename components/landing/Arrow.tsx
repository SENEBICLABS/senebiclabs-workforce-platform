/**
 * The arrow on the public site's call to action.
 *
 * Decorative: the label beside it already says where the button goes, so it is
 * hidden from assistive technology. It nudges forward when its button is
 * hovered, which needs `group` on that button, and stays put on a disabled one.
 */
export function Arrow() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className="shrink-0 transition-transform duration-150 group-hover:translate-x-0.5 group-disabled:translate-x-0"
    >
      <path
        d="M3 8h10M9 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
