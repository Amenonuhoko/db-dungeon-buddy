// A single rolled die, rendered as an actual die face rather than a bare
// number. d6 gets real pips (standard 1-6 layouts). Every other common
// size gets the outline of its actual polyhedron face/silhouette —
// confirmed against how these dice are genuinely shaped, not guessed:
// d4/d20 faces are equilateral triangles (a tetrahedron's and an
// icosahedron's), d12 faces are pentagons (dodecahedron), and d10's
// pentagonal-trapezohedron faces are kites — d8 is drawn as the
// diamond/bipyramid silhouette of the whole die (two square pyramids
// base-to-base) rather than one triangular face, since a bare triangle
// would be indistinguishable from d4/d20 at this size. d20 is widened
// into a hexagon rather than a plain triangle for the same reason —
// "many-sided, almost round" needs to read differently from d4's sharp
// point. Anything else (a custom d7, d47, …) falls back to a circle —
// there's no real polyhedron to reference, so it doesn't pretend to be
// one. Tumbles in on mount, staggered by `index` — see DiceRoller.jsx,
// which remounts this whole row on every roll.
const PIP_LAYOUTS = {
  1: [[12, 12]],
  2: [[7, 7], [17, 17]],
  3: [[7, 7], [12, 12], [17, 17]],
  4: [[7, 7], [17, 7], [7, 17], [17, 17]],
  5: [[7, 7], [17, 7], [12, 12], [7, 17], [17, 17]],
  6: [[7, 6.5], [7, 12], [7, 17.5], [17, 6.5], [17, 12], [17, 17.5]],
};

// Point lists trace each polygon's perimeter in order, in a shared
// 24x24 box centered on (12,12). textY nudges the numeral toward each
// shape's visual center of mass (a triangle's is lower than its
// bounding box's, for instance) rather than the box's literal center.
const SHAPES = {
  4: { points: '12,3 20.5,18 3.5,18', textY: 16.5 },
  8: { points: '12,2 22,12 12,22 2,12', textY: 13 },
  10: { points: '12,2 21,9 12,22 3,9', textY: 13.5 },
  12: { points: '12,2 21.5,8.9 17.9,20.1 6.1,20.1 2.5,8.9', textY: 13 },
  20: { points: '12,2 20.66,7 20.66,17 12,22 3.34,17 3.34,7', textY: 13 },
};

const TUMBLE_STEP_MS = 55;
const TUMBLE_STEP_CAP_MS = 320;

export function Die({ sides, value, index = 0 }) {
  const delay = Math.min(index * TUMBLE_STEP_MS, TUMBLE_STEP_CAP_MS);
  const isPipDie = sides === 6 && value >= 1 && value <= 6;
  const shape = SHAPES[sides];
  const numeralSize = value >= 100 ? 7 : value >= 10 ? 8.5 : 10;

  return (
    <div className="die-face" style={{ animationDelay: `${delay}ms` }} title={`d${sides}: ${value}`}>
      <svg viewBox="0 0 24 24" width="34" height="34" role="img" aria-label={`d${sides} rolled ${value}`}>
        {isPipDie ? (
          <>
            <rect x="2" y="2" width="20" height="20" rx="5" fill="var(--gold)" stroke="var(--gold-deep)" strokeWidth="1.2" />
            {PIP_LAYOUTS[value].map(([x, y]) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r="1.7" fill="var(--surface)" />
            ))}
          </>
        ) : shape ? (
          <>
            <polygon points={shape.points} fill="var(--surface-raised)" stroke="var(--gold)" strokeWidth="1.3" strokeLinejoin="round" />
            <text
              x="12"
              y={shape.textY}
              textAnchor="middle"
              dominantBaseline="middle"
              fontFamily="var(--font-mono)"
              fontSize={numeralSize}
              fontWeight="700"
              fill="var(--gold-bright)"
            >
              {value}
            </text>
          </>
        ) : (
          <>
            <circle cx="12" cy="12" r="10" fill="var(--surface-raised)" stroke="var(--gold)" strokeWidth="1.3" />
            <text
              x="12"
              y="12.5"
              textAnchor="middle"
              dominantBaseline="middle"
              fontFamily="var(--font-mono)"
              fontSize={numeralSize}
              fontWeight="700"
              fill="var(--gold-bright)"
            >
              {value}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}
