// Live action moments (BIBLE.md §8 Phase 6): what changed on the scene
// since the last refetch, as short animations. Worked out by comparing two
// snapshots of what's on screen, so every device plays the same moments
// from the same data — nothing extra is stored or sent.
//
// snapshot = {
//   sceneId,
//   tokens: { [key]: { hp, exact, band, conditions: [label] } },
//   currentKey, mineCurrent,
//   lines: [{ id, text, style, body, aimed }]   // log lines and rolls, newest first
// }
//
// Plain lines become captions; announcements (017 — a call, a title
// card, a handout) come back separately so the screen can stage them.

export const MOMENT_MS = 2400;
export const CAPTION_MS = 4200;

export function diffMoments(prev, next) {
  const result = { tokens: [], captions: [], announcements: [], yourTurn: false };
  if (!prev || !next) return result;

  const seen = new Set(prev.lines.map((l) => l.id));
  const fresh = next.lines.filter((l) => !seen.has(l.id)).reverse();
  result.captions = fresh.filter((l) => !l.style || l.style === 'line').slice(-3).map((l) => l.text);
  result.announcements = fresh.filter((l) => l.style && l.style !== 'line');

  // Token moments only within one scene — switching scenes isn't a hit.
  if (prev.sceneId !== next.sceneId) return result;

  for (const [key, now] of Object.entries(next.tokens)) {
    const was = prev.tokens[key];
    if (!was) {
      result.tokens.push({ key, kind: 'enter' });
      continue;
    }
    if (was.hp != null && now.hp != null && was.hp !== now.hp) {
      const delta = now.hp - was.hp;
      const bandText = now.band !== was.band ? now.band : '';
      result.tokens.push({
        key,
        kind: delta < 0 ? 'hit' : 'heal',
        text: now.exact ? `${delta < 0 ? '−' : '+'}${Math.abs(delta)}` : bandText,
      });
    }
    for (const label of now.conditions) {
      if (!was.conditions.includes(label)) result.tokens.push({ key, kind: 'condition', text: label });
    }
  }

  if (next.currentKey && next.currentKey !== prev.currentKey) {
    result.tokens.push({ key: next.currentKey, kind: 'turn' });
    result.yourTurn = next.mineCurrent;
  }
  return result;
}
