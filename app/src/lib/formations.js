import { clamp01 } from './scenes';

// Token geometry in picture fractions (x of the width, y of the height;
// `aspect` = width / height). A grid square is `grid.size` of the width
// across and `grid.size * aspect` of the height tall.

const DEFAULT_STEP = 0.06;

function cell(grid, aspect) {
  const w = grid?.size || DEFAULT_STEP;
  return { w, h: w * aspect };
}

// Snap a token to the grid: an odd-sized token (1, 3 squares) sits in the
// middle of a square, an even-sized one (2, 4) on a corner between them.
export function snapToGrid(spot, grid, aspect, size = 1) {
  if (!grid) return spot;
  const { w, h } = cell(grid, aspect);
  // The tiny nudge keeps a spot exactly on a line (0.8 / 0.08) from
  // falling into the square before it through floating-point error.
  const snap = (v, step) => (size % 2 ? (Math.floor(v / step + 1e-9) + 0.5) * step : Math.round(v / step) * step);
  const r3 = (n) => Math.round(clamp01(n) * 1000) / 1000;
  return { x: r3(snap(spot.x, w)), y: r3(snap(spot.y, h)) };
}

export const centroid = (spots) => ({
  x: spots.reduce((a, s) => a + s.x, 0) / spots.length,
  y: spots.reduce((a, s) => a + s.y, 0) / spots.length,
});

// Where each of `count` tokens stands in a marching order around `at`,
// one square apart: single file, two abreast, or a circle (round the
// campfire, back to back).
export const FORMATIONS = [
  { id: 'file', name: 'Single file' },
  { id: 'pairs', name: 'Two abreast' },
  { id: 'circle', name: 'Circle' },
];

export function formation(kind, count, at, grid, aspect) {
  const { w, h } = cell(grid, aspect);
  let offsets;
  if (kind === 'file') {
    offsets = Array.from({ length: count }, (_, i) => ({ dx: 0, dy: (i - (count - 1) / 2) * h }));
  } else if (kind === 'pairs') {
    const rows = Math.ceil(count / 2);
    offsets = Array.from({ length: count }, (_, i) => ({ dx: (i % 2 ? 0.5 : -0.5) * w, dy: (Math.floor(i / 2) - (rows - 1) / 2) * h }));
  } else {
    const r = count < 2 ? 0 : Math.max(1, count / (2 * Math.PI)) * 1.1;
    offsets = Array.from({ length: count }, (_, i) => {
      const a = (i / count) * Math.PI * 2 - Math.PI / 2;
      return { dx: Math.cos(a) * r * w, dy: Math.sin(a) * r * h };
    });
  }
  return offsets.map(({ dx, dy }) => snapOrKeep({ x: at.x + dx, y: at.y + dy }, grid, aspect));
}

function snapOrKeep(spot, grid, aspect) {
  const clamped = { x: clamp01(spot.x), y: clamp01(spot.y) };
  return grid ? snapToGrid(clamped, grid, aspect) : { x: Math.round(clamped.x * 1000) / 1000, y: Math.round(clamped.y * 1000) / 1000 };
}

// Moving a group: everyone shifts by the same amount, kept on the picture.
export function shiftAll(spots, dx, dy) {
  return spots.map((s) => ({ ...s, x: Math.round(clamp01(s.x + dx) * 1000) / 1000, y: Math.round(clamp01(s.y + dy) * 1000) / 1000 }));
}
