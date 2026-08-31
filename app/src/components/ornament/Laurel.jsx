// A single laurel branch, hand-drawn as smooth bezier leaves off a curved
// stem — bay-laurel shaped (paired leaves, tapering tip, a couple of
// berries near the base) rather than the stiffer ellipse-rosette this
// replaced. flip=true mirrors it for the opposite side of a heading.
const LEAVES = [
  { t: 0.18, side: 1, size: 1 },
  { t: 0.32, side: -1, size: 1.08 },
  { t: 0.48, side: 1, size: 1.05 },
  { t: 0.62, side: -1, size: 0.95 },
  { t: 0.76, side: 1, size: 0.85 },
  { t: 0.88, side: -1, size: 0.7 },
];

// Point + tangent angle along the stem's cubic bezier, used to plant each
// leaf so it follows the curve instead of sitting at a fixed angle.
function stemPoint(t) {
  const p0 = { x: 2, y: 18 };
  const p1 = { x: 14, y: 2 };
  const p2 = { x: 28, y: 4 };
  const p3 = { x: 40, y: 12 };
  const mt = 1 - t;
  const x = mt ** 3 * p0.x + 3 * mt ** 2 * t * p1.x + 3 * mt * t ** 2 * p2.x + t ** 3 * p3.x;
  const y = mt ** 3 * p0.y + 3 * mt ** 2 * t * p1.y + 3 * mt * t ** 2 * p2.y + t ** 3 * p3.y;
  const dx = 3 * mt ** 2 * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t ** 2 * (p3.x - p2.x);
  const dy = 3 * mt ** 2 * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t ** 2 * (p3.y - p2.y);
  return { x, y, angle: (Math.atan2(dy, dx) * 180) / Math.PI };
}

function Leaf({ t, side, size }) {
  const { x, y, angle } = stemPoint(t);
  const rotate = angle + side * 55;
  const w = 9 * size;
  const h = 4.2 * size;
  return (
    <path
      d={`M0,0 C ${w * 0.35},${-h} ${w * 0.75},${-h} ${w},0 C ${w * 0.75},${h} ${w * 0.35},${h} 0,0 Z`}
      fill="var(--gold)"
      opacity={0.55 + t * 0.4}
      transform={`translate(${x} ${y}) rotate(${rotate})`}
    />
  );
}

function Branch({ flip }) {
  return (
    <svg
      viewBox="0 0 42 20"
      width="60"
      height="30"
      role="presentation"
      aria-hidden="true"
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
    >
      <path
        d="M2 18 C 14 2, 28 4, 40 12"
        fill="none"
        stroke="var(--gold-deep)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="3.5" cy="17" r="1.6" fill="var(--gold-deep)" opacity="0.8" />
      <circle cx="6.5" cy="15.2" r="1.3" fill="var(--gold-deep)" opacity="0.7" />
      {LEAVES.map((leaf, i) => (
        <Leaf key={i} {...leaf} />
      ))}
    </svg>
  );
}

export function LaurelFlourish({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'center' }}>
      <Branch />
      {children}
      <Branch flip />
    </div>
  );
}
