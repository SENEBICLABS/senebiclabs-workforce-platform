/**
 * The Senebiclabs mark, taken verbatim from senebiclabs.com so the two
 * properties carry the same logo rather than two drawings of one idea.
 *
 * Inherits currentColor, so it takes whatever the brand link is set to.
 */
export function BrandMark({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={(size * 21) / 20}
      viewBox="0 0 40 42"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <line x1="20" y1="39" x2="20" y2="3" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M 20 39 C 15 30 11 18 11 8" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M 20 39 C 25 30 29 18 29 8" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M 20 39 C 12 35  5 27  5 18" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M 20 39 C 28 35 35 27 35 18" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="20" cy="39" r="2.5" fill="currentColor" />
      <circle cx="20" cy="3" r="2" fill="currentColor" />
      <circle cx="11" cy="8" r="2" fill="currentColor" />
      <circle cx="29" cy="8" r="2" fill="currentColor" />
      <circle cx="5" cy="18" r="2" fill="currentColor" />
      <circle cx="35" cy="18" r="2" fill="currentColor" />
    </svg>
  );
}
