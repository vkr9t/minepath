/** MinePath mark: stepped mine benches climbing to an upward arrow, with strata lines below. Mirrors public/favicon.svg. */
export function Mark({ size = 40, tile = '#FF5A0A', stroke = '#0B0B0B', strata = '#0B0B0B' }: { size?: number; tile?: string; stroke?: string; strata?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden="true" focusable="false">
      <rect width="72" height="72" rx="10" fill={tile} />
      <g transform="translate(4 2)">
        <path d="M13 49 H25 V38 H37 V27 H49 V17" fill="none" stroke={stroke} strokeWidth="6.5" />
        <path d="M40 15 H52 V27" fill="none" stroke={stroke} strokeWidth="6.5" />
        <path d="M13 55 H51" stroke={strata} strokeWidth="2.4" />
        <path d="M13 60 H37" stroke={strata} strokeOpacity=".55" strokeWidth="2.4" />
      </g>
    </svg>
  );
}

/** Header lockup for dark backgrounds. The wordmark is live text in the display face so it stays crisp and selectable. */
export default function Logo() {
  return (
    <span className="logo" role="img" aria-label="MinePath, carbon planner">
      <Mark size={40} />
      <span className="logo-text" aria-hidden="true">
        <span className="logo-word">MINEPATH</span>
        <span className="logo-sub">CARBON PLANNER</span>
      </span>
    </span>
  );
}
