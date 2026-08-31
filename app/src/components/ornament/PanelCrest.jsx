// Replaces the old flat Greek-key strip as the "primary panel" top
// ornament (Panel's `topRule` prop) — a small heraldic crest instead of
// a repeating meander: end studs, tapering rules, a pair of laurel
// sprigs, and a faceted gem at center. Stretches edge-to-edge
// (preserveAspectRatio="none") to match the flush negative-margin
// treatment `.panel-top-rule` already gives it.
export function PanelCrest({ width = 320, height = 22 }) {
  const midY = height / 2;
  const cx = width / 2;

  const leaf = (x, side, scale = 1) => {
    const w = 9 * scale;
    const h = 3.6 * scale;
    const rotate = side > 0 ? -12 : 192;
    return (
      <path
        key={`${x}-${side}`}
        d={`M0,0 C ${w * 0.35},${-h} ${w * 0.75},${-h} ${w},0 C ${w * 0.75},${h} ${w * 0.35},${h} 0,0 Z`}
        fill="var(--gold)"
        opacity="0.75"
        transform={`translate(${x} ${midY}) rotate(${rotate})`}
      />
    );
  };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      role="presentation"
      aria-hidden="true"
    >
      <circle cx={6} cy={midY} r="1.6" fill="var(--gold-deep)" />
      <circle cx={width - 6} cy={midY} r="1.6" fill="var(--gold-deep)" />

      <line x1={12} y1={midY} x2={cx - 15} y2={midY} stroke="var(--gold-deep)" strokeWidth="1.1" opacity="0.85" />
      <line x1={cx + 15} y1={midY} x2={width - 12} y2={midY} stroke="var(--gold-deep)" strokeWidth="1.1" opacity="0.85" />

      {leaf(cx - 28, 1, 0.9)}
      {leaf(cx + 28, -1, 0.9)}

      <g transform={`translate(${cx} ${midY}) rotate(45)`}>
        <rect x="-5" y="-5" width="10" height="10" rx="2" fill="none" stroke="var(--gold)" strokeWidth="1.3" />
      </g>
      <circle cx={cx} cy={midY} r="1.4" fill="var(--gold-bright)" />
    </svg>
  );
}
