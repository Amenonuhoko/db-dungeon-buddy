import { useId } from 'react';
import { AREA_COLORS, areaLabelSpot, areaPath, isArea } from '../lib/mapmarks.js';

// What the DM has drawn on the map, inside the stage so it pans and zooms
// with the picture: spell areas (translucent, under the tokens) and
// markers — a door, a trap, loot, a label. A mark the players can't see
// yet is shown to the DM dashed. `draft` is one being placed.
export function SceneAreas({ marks, draft, grid, aspect }) {
  const tall = 1000 / aspect;
  const areas = marks.filter(isArea);
  if (areas.length === 0 && !draft) return null;
  return (
    <svg className="scene-areas" viewBox={`0 0 1000 ${tall}`} preserveAspectRatio="none" aria-hidden="true">
      {[...areas, ...(draft ? [{ ...draft, id: 'draft' }] : [])].map((m) => {
        const color = AREA_COLORS[m.color] || AREA_COLORS.plain;
        return (
          <path
            key={m.id}
            d={areaPath(m, grid, aspect)}
            className={`scene-area${m.dmOnly ? ' dm-only' : ''}${m.id === 'draft' ? ' draft' : ''}`}
            style={{ '--area': color }}
          />
        );
      })}
    </svg>
  );
}

export function SceneMarkers({ marks, onTap, showInfo }) {
  return marks
    .filter((m) => !isArea(m))
    .map((m) => (
      <button
        key={m.id}
        type="button"
        className={`scene-marker scene-marker-${m.kind}${m.dmOnly ? ' dm-only' : ''}`}
        style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}
        onClick={(e) => {
          e.stopPropagation();
          onTap?.(m);
        }}
        aria-label={m.label || m.kind}
        tabIndex={onTap ? 0 : -1}
      >
        <MarkerIcon kind={m.kind} />
        {m.label && (m.kind === 'label' || showInfo) && <span className="scene-marker-label">{m.label}</span>}
      </button>
    ));
}

// Labels on areas, so the table knows what the red circle is.
export function AreaLabels({ marks, grid, aspect, onTap }) {
  return marks.filter(isArea).map((m) => {
    const spot = areaLabelSpot(m, grid, aspect);
    return (
      <button
        key={m.id}
        type="button"
        className={`scene-area-label${m.dmOnly ? ' dm-only' : ''}`}
        style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%`, '--area': AREA_COLORS[m.color] || AREA_COLORS.plain }}
        onClick={(e) => {
          e.stopPropagation();
          onTap?.(m);
        }}
        tabIndex={onTap ? 0 : -1}
      >
        {m.label || `${m.sizeFt} ft ${m.kind}`}
      </button>
    );
  });
}

function MarkerIcon({ kind }) {
  const common = { viewBox: '0 0 24 24', width: 22, height: 22, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  if (kind === 'door')
    return (
      <svg {...common}>
        <path d="M6 21 V4 C6 3.4 6.4 3 7 3 H17 C17.6 3 18 3.4 18 4 V21" />
        <path d="M4 21 H20" />
        <circle cx="15" cy="12.5" r="1" fill="currentColor" />
      </svg>
    );
  if (kind === 'trap')
    return (
      <svg {...common}>
        <path d="M3 19 L6 11 L9 19 L12 9 L15 19 L18 11 L21 19 Z" />
      </svg>
    );
  if (kind === 'loot')
    return (
      <svg {...common}>
        <path d="M4 11 C4 7.5 7.5 5 12 5 C16.5 5 20 7.5 20 11 V19 H4 Z" />
        <path d="M4 11 H20 M11 10 H13 V13 H11 Z" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M6 21 V3" />
      <path d="M6 4 H18 L15.5 7.5 L18 11 H6" />
    </svg>
  );
}

// The fog of war: dark over everything except what the DM has painted
// open (strokes in order — reveal, then hide again). The DM sees through
// it at half strength. Blurred edges, so it reads as fog, not stencil.
export function SceneFog({ fog, draft, aspect, isDM }) {
  const id = useId().replace(/:/g, '');
  const tall = 1000 / aspect;
  const strokes = draft ? [...fog.strokes, draft] : fog.strokes;
  const path = (p) => {
    let d = '';
    for (let i = 0; i < p.length; i += 2) d += `${i ? 'L' : 'M'}${p[i]},${(p[i + 1] / aspect).toFixed(1)}`;
    return p.length === 2 ? `${d} l0.1,0` : d;
  };
  return (
    <svg className={`scene-fog${isDM ? ' scene-fog-dm' : ''}`} viewBox={`0 0 1000 ${tall}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        {/* The whole map as the filter's area: by default it's the strokes'
            bounding box, which clips a straight stroke away entirely. */}
        <filter id={`${id}-soft`} filterUnits="userSpaceOnUse" x="0" y="0" width="1000" height={tall}>
          <feGaussianBlur stdDeviation="8" />
        </filter>
        <mask id={`${id}-mask`}>
          <rect width="1000" height={tall} fill="#fff" />
          <g filter={`url(#${id}-soft)`} fill="none" strokeLinecap="round" strokeLinejoin="round">
            {strokes.map((s, i) => (
              <path key={i} d={path(s.p)} stroke={s.m === 'h' ? '#fff' : '#000'} strokeWidth={s.w} />
            ))}
          </g>
        </mask>
      </defs>
      <rect width="1000" height={tall} fill="#0b0908" mask={`url(#${id}-mask)`} />
    </svg>
  );
}
