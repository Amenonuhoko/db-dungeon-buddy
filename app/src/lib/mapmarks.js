// Things the DM draws on the map (019: scene_marks) and the fog of war
// (scenes.fog). Geometry works in "width units": 1000 across the
// picture, and 1000 / aspect down it, so circles stay round on any shape
// of picture. A spell area's feet become width units through the grid
// (a square is grid.size of the width and worth grid.feet), or 5 ft =
// 5% of the width when there's no grid.

export const MARKERS = [
  { kind: 'door', name: 'Door' },
  { kind: 'trap', name: 'Trap', hidden: true },
  { kind: 'loot', name: 'Loot' },
  { kind: 'label', name: 'Label' },
];

export const AREA_COLORS = {
  fire: '#ff7a1a',
  cold: '#7fd6ff',
  lightning: '#f4f08a',
  acid: '#8fe03a',
  necrotic: '#8a4ab0',
  radiant: '#ffe08a',
  force: '#c8a2ff',
  plain: '#e8e0d0',
};

export const AREA_PRESETS = [
  { name: 'Fireball', kind: 'circle', size: 20, color: 'fire' },
  { name: 'Spirit Guardians', kind: 'circle', size: 15, color: 'radiant' },
  { name: 'Darkness', kind: 'circle', size: 15, color: 'necrotic' },
  { name: 'Fog Cloud', kind: 'circle', size: 20, color: 'plain' },
  { name: 'Thunderwave', kind: 'square', size: 15, color: 'force' },
  { name: 'Web', kind: 'square', size: 20, color: 'plain' },
  { name: 'Burning Hands', kind: 'cone', size: 15, color: 'fire' },
  { name: 'Breath (30 ft cone)', kind: 'cone', size: 30, color: 'acid' },
  { name: 'Cone of Cold', kind: 'cone', size: 60, color: 'cold' },
  { name: 'Lightning Bolt', kind: 'line', size: 100, color: 'lightning' },
  { name: 'Wall of Fire', kind: 'line', size: 60, color: 'fire' },
];

export const AREA_KINDS = ['circle', 'square', 'cone', 'line'];
export const isArea = (mark) => AREA_KINDS.includes(mark.kind);
export const isAimed = (kind) => kind === 'cone' || kind === 'line';

const CONE_HALF = Math.atan(0.5); // a 5e cone is as wide as it is long

// Feet → width units.
export function feetToUnits(feet, grid) {
  const size = grid?.size || 0.05;
  const per = grid?.feet || 5;
  return (feet / per) * size * 1000;
}

// The area's outline as an SVG path in width units.
export function areaPath(mark, grid, aspect) {
  const cx = mark.x * 1000;
  const cy = (mark.y * 1000) / aspect;
  const L = feetToUnits(mark.sizeFt, grid);
  const a = ((mark.angle || 0) * Math.PI) / 180;
  const pt = (ang, d) => `${(cx + Math.cos(ang) * d).toFixed(1)},${(cy + Math.sin(ang) * d).toFixed(1)}`;
  if (mark.kind === 'circle') {
    return `M${cx - L},${cy} a${L},${L} 0 1,0 ${2 * L},0 a${L},${L} 0 1,0 ${-2 * L},0Z`;
  }
  if (mark.kind === 'square') {
    const h = L / 2;
    return `M${cx - h},${cy - h} h${L} v${L} h${-L}Z`;
  }
  if (mark.kind === 'cone') {
    const edge = L / Math.cos(CONE_HALF);
    return `M${cx},${cy} L${pt(a - CONE_HALF, edge)} L${pt(a + CONE_HALF, edge)}Z`;
  }
  // line: 5 ft wide
  const w = feetToUnits(5, grid) / 2;
  const n = a + Math.PI / 2;
  const p = (along, across) => `${(cx + Math.cos(a) * along + Math.cos(n) * across).toFixed(1)},${(cy + Math.sin(a) * along + Math.sin(n) * across).toFixed(1)}`;
  return `M${p(0, -w)} L${p(L, -w)} L${p(L, w)} L${p(0, w)}Z`;
}

// Where an area's label goes: off its edge (below a circle or cube, past
// the end of a cone or line) — the middle is usually under a monster.
export function areaLabelSpot(mark, grid, aspect) {
  const L = feetToUnits(mark.sizeFt, grid) / 1000;
  const clamp = (n) => Math.min(0.98, Math.max(0.02, n));
  if (mark.kind === 'circle' || mark.kind === 'square') {
    const down = mark.kind === 'circle' ? L : L / 2;
    return { x: mark.x, y: clamp(mark.y + down * aspect + 0.03) };
  }
  const a = ((mark.angle || 0) * Math.PI) / 180;
  return { x: clamp(mark.x + Math.cos(a) * L * 1.08), y: clamp(mark.y + Math.sin(a) * L * 1.08 * aspect) };
}

// Is a point (0–1 fractions) inside the area? For "pick everyone in the
// Fireball".
export function insideArea(mark, point, grid, aspect) {
  const dx = (point.x - mark.x) * 1000;
  const dy = ((point.y - mark.y) * 1000) / aspect;
  const L = feetToUnits(mark.sizeFt, grid);
  const a = ((mark.angle || 0) * Math.PI) / 180;
  const along = dx * Math.cos(a) + dy * Math.sin(a);
  const across = -dx * Math.sin(a) + dy * Math.cos(a);
  if (mark.kind === 'circle') return Math.hypot(dx, dy) <= L;
  if (mark.kind === 'square') return Math.abs(dx) <= L / 2 && Math.abs(dy) <= L / 2;
  if (mark.kind === 'cone') return along >= 0 && along <= L && Math.abs(across) <= along * Math.tan(CONE_HALF);
  return along >= 0 && along <= L && Math.abs(across) <= feetToUnits(5, grid) / 2;
}

// ---------------------------------------------------------------------
// Fog of war
// ---------------------------------------------------------------------
export const FOG_BRUSHES = [
  { id: 'small', name: 'Small', width: 40 },
  { id: 'medium', name: 'Medium', width: 90 },
  { id: 'large', name: 'Large', width: 180 },
];
export const MAX_FOG_STROKES = 600;

// Is a spot (0–1 fractions) still in the fog? Strokes are replayed in
// order — inside a reveal stroke it's clear, inside a later hide stroke
// it's fogged again. Players aren't sent what they couldn't see.
export function inFog(fog, spot, aspect) {
  if (!fog) return false;
  const px = spot.x * 1000;
  const py = (spot.y * 1000) / aspect;
  let fogged = true;
  for (const s of fog.strokes) {
    const r = s.w / 2;
    const p = s.p;
    let hit = false;
    for (let i = 0; i < p.length && !hit; i += 2) {
      const ax = p[i];
      const ay = p[i + 1] / aspect;
      const bx = i + 2 < p.length ? p[i + 2] : ax;
      const by = i + 2 < p.length ? p[i + 3] / aspect : ay;
      const dx = bx - ax;
      const dy = by - ay;
      const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
      hit = Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) <= r;
    }
    if (hit) fogged = s.m === 'h';
  }
  return fogged;
}

export function fogOf(scene) {
  const fog = scene?.fog;
  if (!fog || typeof fog !== 'object' || !fog.on) return null;
  return { on: true, strokes: Array.isArray(fog.strokes) ? fog.strokes : [] };
}
