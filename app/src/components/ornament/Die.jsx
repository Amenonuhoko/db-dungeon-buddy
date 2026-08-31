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
// 24x24 box centered on (12,12). textY centers the numeral on each
// shape's incircle (the largest circle it can hold without crossing an
// edge) rather than the bounding box's literal center — for the wider
// shapes that's close enough to the same point either way, but the
// triangle's incircle sits well above its bounding-box center (its bulk
// is concentrated toward the base), so nudging *down* from center — as a
// pre-incircle version of this table did, aiming for "visual center of
// mass" — actually pushed the numeral toward the base's edge, cutting it
// off (worst right when a natural max on a d4 also draws the thicker
// critical-glow stroke, tightening the fit further). numeralScale
// shrinks the digit for shapes whose incircle is small relative to a
// 24-unit box — currently just the triangle — so it clears the stroke
// with room to spare instead of merely fitting exactly.
const SHAPES = {
  4: { points: '12,3 20.5,18 3.5,18', textY: 13, numeralScale: 0.72 },
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
  const numeralSize = (value >= 100 ? 7 : value >= 10 ? 8.5 : 10) * (shape?.numeralScale ?? 1);

  // The one moment every D&D table actually cheers or groans at — rolling
  // a die's best or worst possible face. Only means anything on a die
  // that isn't already at both extremes (sides > 1, always true here
  // since DiceRoller clamps sides >= 2), and independently per die, not
  // just d20 — a maxed d6 in a damage pool deserves the same flourish.
  const isCritical = value === sides;
  const isFumble = value === 1;
  const faceClass = isCritical ? ' die-critical' : isFumble ? ' die-fumble' : '';
  const label = `d${sides} rolled ${value}${isCritical ? ' — critical!' : isFumble ? ' — fumble' : ''}`;
  // Text was always gold-bright regardless of roll — keep that baseline,
  // just redirect it to oxblood on a fumble. The outline is the one that
  // actually needs a three-way split: dim `--gold` normally (unchanged
  // from before this flourish existed), bright gold on a critical, and
  // oxblood on a fumble — using `textColor` for both would brighten
  // every ordinary die's outline, not just the special ones.
  const textColor = isFumble ? 'var(--oxblood)' : 'var(--gold-bright)';
  const strokeColor = isCritical ? 'var(--gold-bright)' : isFumble ? 'var(--oxblood)' : 'var(--gold)';

  return (
    <div className={`die-face${faceClass}`} style={{ animationDelay: `${delay}ms` }} title={label}>
      <svg viewBox="0 0 24 24" width="34" height="34" role="img" aria-label={label}>
        {isPipDie ? (
          <>
            <rect
              x="2"
              y="2"
              width="20"
              height="20"
              rx="5"
              fill={isFumble ? 'var(--oxblood)' : 'var(--gold)'}
              stroke={isCritical ? 'var(--gold-bright)' : isFumble ? 'var(--oxblood)' : 'var(--gold-deep)'}
              strokeWidth={isCritical || isFumble ? 1.8 : 1.2}
            />
            {PIP_LAYOUTS[value].map(([x, y]) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r="1.7" fill="var(--surface)" />
            ))}
          </>
        ) : shape ? (
          <>
            <polygon
              points={shape.points}
              fill="var(--surface-raised)"
              stroke={strokeColor}
              strokeWidth={isCritical || isFumble ? 1.9 : 1.3}
              strokeLinejoin="round"
            />
            <text
              x="12"
              y={shape.textY}
              textAnchor="middle"
              dominantBaseline="middle"
              fontFamily="var(--font-mono)"
              fontSize={numeralSize}
              fontWeight="700"
              fill={textColor}
            >
              {value}
            </text>
          </>
        ) : (
          <>
            <circle cx="12" cy="12" r="10" fill="var(--surface-raised)" stroke={strokeColor} strokeWidth={isCritical || isFumble ? 1.9 : 1.3} />
            <text
              x="12"
              y="12.5"
              textAnchor="middle"
              dominantBaseline="middle"
              fontFamily="var(--font-mono)"
              fontSize={numeralSize}
              fontWeight="700"
              fill={textColor}
            >
              {value}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}
