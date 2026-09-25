// Tiny avatar helpers shared by the presence strip and Table Talk.
export function initials(name) {
  return (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

// A stable per-person colour, so the same player always looks the same.
const HUES = [8, 28, 45, 95, 150, 190, 215, 260, 300, 335];
export function hueFor(id) {
  let h = 0;
  for (const ch of id || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
}
