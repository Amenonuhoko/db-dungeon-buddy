// The primary horizontal divider used under headings — a single flowing
// vine (smooth S-curve, bezier leaves, a small center reticle-dot where
// the Warframe half of the theme gets one deliberate accent) rather than
// an angular rule. Panel's `topRule` prop uses PanelCrest.jsx for its own
// (different) top-of-panel ornament — see BIBLE.md §3.
export function FlowingDivider({ width = 320, height = 28 }) {
  const midY = height / 2;
  const amp = height * 0.32;
  const leafAt = (x, y, side, scale = 1) => {
    const w = 11 * scale;
    const h = 4.4 * scale;
    const rotate = side > 0 ? -18 : 198;
    return (
      <path
        key={`${x}-${side}`}
        d={`M0,0 C ${w * 0.35},${-h} ${w * 0.75},${-h} ${w},0 C ${w * 0.75},${h} ${w * 0.35},${h} 0,0 Z`}
        fill="var(--gold)"
        opacity="0.65"
        transform={`translate(${x} ${y}) rotate(${rotate})`}
      />
    );
  };

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="presentation" aria-hidden="true">
      <path
        d={`M4 ${midY} C ${width * 0.18} ${midY - amp}, ${width * 0.32} ${midY + amp}, ${width * 0.5} ${midY}
            C ${width * 0.68} ${midY - amp}, ${width * 0.82} ${midY + amp}, ${width - 4} ${midY}`}
        fill="none"
        stroke="var(--gold-deep)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {leafAt(width * 0.14, midY - amp * 0.55, 1)}
      {leafAt(width * 0.3, midY + amp * 0.55, -1, 0.85)}
      {leafAt(width * 0.7, midY - amp * 0.55, 1, 0.85)}
      {leafAt(width * 0.86, midY + amp * 0.55, -1)}
      <g transform={`translate(${width / 2} ${midY})`}>
        <circle r="3.2" fill="none" stroke="var(--gold)" strokeWidth="1.2" />
        <circle r="1.1" fill="var(--gold)" />
      </g>
    </svg>
  );
}
