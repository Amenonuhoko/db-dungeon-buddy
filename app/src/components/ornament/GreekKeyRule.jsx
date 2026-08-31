import { useId } from 'react';

// A horizontal meander (Greek key) rule, tiled via an SVG <pattern> so it
// scales to any container width without pre-baked raster tiles.
export function GreekKeyRule({ height = 14 }) {
  const unit = 28;
  const patternId = `greek-key-${useId()}`;
  return (
    <svg
      viewBox={`0 0 ${unit} ${height}`}
      preserveAspectRatio="none"
      width="100%"
      height={height}
      role="presentation"
      aria-hidden="true"
    >
      <defs>
        <pattern id={patternId} width={unit} height={height} patternUnits="userSpaceOnUse">
          <path
            d={`M0 ${height} V2 H${unit * 0.4} V${height * 0.55} H${unit * 0.65} V2 H${unit} `}
            fill="none"
            stroke="var(--gold)"
            strokeWidth="1.5"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}
