// A single rolled die, rendered as an actual die face rather than a bare
// number — pips for d6 (the shape everyone actually pictures at "🎲"),
// a gem-cut badge with the numeral for every other size (drawing real
// per-polyhedron shapes for d4/d8/d10/d12/d20 is a lot of geometry for
// not much extra clarity at 34px — the pip/badge split already reads as
// "two kinds of actual dice," which is the point). Tumbles in on mount,
// staggered by `index` — see DiceRoller.jsx, which remounts this whole
// row on every roll.
const PIP_LAYOUTS = {
  1: [[12, 12]],
  2: [[7, 7], [17, 17]],
  3: [[7, 7], [12, 12], [17, 17]],
  4: [[7, 7], [17, 7], [7, 17], [17, 17]],
  5: [[7, 7], [17, 7], [12, 12], [7, 17], [17, 17]],
  6: [[7, 6.5], [7, 12], [7, 17.5], [17, 6.5], [17, 12], [17, 17.5]],
};

const TUMBLE_STEP_MS = 55;
const TUMBLE_STEP_CAP_MS = 320;

export function Die({ sides, value, index = 0 }) {
  const delay = Math.min(index * TUMBLE_STEP_MS, TUMBLE_STEP_CAP_MS);
  const isPipDie = sides === 6 && value >= 1 && value <= 6;
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
        ) : (
          <>
            <rect
              x="4"
              y="4"
              width="16"
              height="16"
              rx="3"
              fill="var(--surface-raised)"
              stroke="var(--gold)"
              strokeWidth="1.3"
              transform="rotate(45 12 12)"
            />
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
