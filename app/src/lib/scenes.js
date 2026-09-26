import { useEffect, useState } from 'react';
import { createLocalStore, createSupabaseStore } from './contentStore';
import { healthDescriptor } from './encounters';
import { loadImageFile } from './portraits';
import { supabase } from './supabase';

// Scenes (db/migrations/015_scenes.sql, BIBLE.md §1/§7): a backdrop the
// DM pushes to the table, tokens showing where everyone stands, and the
// running log of what happened. Same guest/account split as every other
// content type. Token positions are 0–1 fractions of the picture, so a
// scene reads the same on a phone and a laptop.

const localScenes = createLocalStore('scenes');
const remoteScenes = createSupabaseStore('scenes');
const scenesFor = (status) => (status === 'guest' ? localScenes : remoteScenes);

const localTokens = createLocalStore('scene_tokens');
const remoteTokens = createSupabaseStore('scene_tokens');
const tokensFor = (status) => (status === 'guest' ? localTokens : remoteTokens);

const localEvents = createLocalStore('scene_events');
const localEventsKey = (campaignId) => `codex.guest.content.scene_events.${campaignId}`;

const localMarks = createLocalStore('scene_marks');
const remoteMarks = createSupabaseStore('scene_marks');
const marksFor = (status) => (status === 'guest' ? localMarks : remoteMarks);

export const SCENE_TABLES = ['scenes', 'scene_tokens', 'scene_events', 'scene_marks'];

export function sceneMissing(error) {
  const msg = error?.message || '';
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    error?.code === 'PGRST202' ||
    (/scene/.test(msg) && /schema cache|does not exist|could not find/i.test(msg))
  );
}

// Which scene migration the connected database is missing, if any: one
// cheap "select nothing" per migration, asking for a column it added. A
// database a step behind the app otherwise fails in confusing ways (an
// older migration's name in the error), so the screen says exactly which
// files to run. Returns the first missing number (15–20) or null.
const SCHEMA_PROBES = [
  [15, 'scenes', 'id'],
  [15, 'scene_tokens', 'id'],
  [15, 'scene_events', 'id'],
  [16, 'scenes', 'grid_size'],
  [17, 'scenes', 'mood'],
  [17, 'scene_events', 'style,to_user'],
  [18, 'scene_tokens', 'dm_only,size,creature_id'],
  [18, 'encounters', 'timers'],
  [19, 'scene_marks', 'id'],
  [19, 'scenes', 'fog'],
  [20, 'npcs', 'id'],
  [20, 'scene_tokens', 'npc_id,archetype'],
];
export const SCENE_MIGRATION_FILES = {
  15: '015_scenes.sql',
  16: '016_scene_grid.sql',
  17: '017_dm_quick_tools.sql',
  18: '018_tokens_for_the_dm.sql',
  19: '019_fog_and_marks.sql',
  20: '020_npcs.sql',
};

const isMissing = (error) => ['42703', '42P01', 'PGRST204', 'PGRST205'].includes(error?.code) || /does not exist|could not find/i.test(error?.message || '');

export async function missingSceneMigration() {
  const results = await Promise.all(
    SCHEMA_PROBES.map(async ([n, table, columns]) => {
      try {
        const { error } = await supabase.from(table).select(columns).limit(0);
        return error && isMissing(error) ? n : null;
      } catch {
        return null; // offline or unreachable — not a schema problem
      }
    }),
  );
  const gaps = results.filter(Boolean);
  return gaps.length ? Math.min(...gaps) : null;
}

export const SCENE_MIGRATION_HINT =
  'Scenes need the latest database update — whoever runs the backend should run db/migrations/015_scenes.sql (see README).';

// ---------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------
export function listScenes(status, campaignId) {
  return scenesFor(status).list(campaignId);
}

export function createScene(status, campaignId, name, backgroundPath = null) {
  return scenesFor(status).create(campaignId, { name, active: false, backgroundPath, encounterId: null });
}

// Switching to a built-in backdrop drops an uploaded picture's file.
export async function setSceneBackdrop(status, campaignId, scene, id) {
  const updated = await scenesFor(status).update(campaignId, scene.id, { backgroundPath: builtinPath(id) });
  await deleteArt(scene.backgroundPath);
  return updated;
}

export function updateScene(status, campaignId, id, patch) {
  return scenesFor(status).update(campaignId, id, patch);
}

export async function removeScene(status, campaignId, scene) {
  await deleteArt(scene.backgroundPath);
  await scenesFor(status).remove(campaignId, scene.id);
  if (status === 'guest') {
    const tokens = await localTokens.list(campaignId);
    await Promise.all(tokens.filter((t) => t.sceneId === scene.id).map((t) => localTokens.remove(campaignId, t.id)));
    const marks = await localMarks.list(campaignId);
    await Promise.all(marks.filter((m) => m.sceneId === scene.id).map((m) => localMarks.remove(campaignId, m.id)));
  }
}

// Only one scene is live at a time; online the swap is one transaction.
export async function pushScene(status, campaignId, sceneId) {
  if (status === 'guest') {
    const scenes = await localScenes.list(campaignId);
    await Promise.all(
      scenes
        .filter((s) => s.active !== (s.id === sceneId))
        .map((s) => localScenes.update(campaignId, s.id, { active: s.id === sceneId })),
    );
    return;
  }
  const { error } = await supabase.rpc('push_scene', { p_scene_id: sceneId });
  if (error) throw error;
}

// ---------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------
export function listTokens(status, campaignId) {
  return tokensFor(status).list(campaignId);
}

export function addToken(status, campaignId, fields) {
  return tokensFor(status).create(campaignId, { hidden: false, characterId: null, combatantId: null, label: null, ...fields });
}

export function updateToken(status, campaignId, id, patch) {
  return tokensFor(status).update(campaignId, id, patch);
}

export function removeToken(status, campaignId, id) {
  return tokensFor(status).remove(campaignId, id);
}

// A PC's token on one scene: created the first time anyone places them
// (PCs stand on every scene by default, so there may be no row yet).
// A player moves their own through place_my_token(); the DM writes the
// row directly, which also covers hiding someone from the scene.
export async function placeCharacter(status, campaignId, { sceneId, characterId, x, y, hidden, asDM, existing }) {
  if (status === 'guest' || asDM) {
    const patch = { ...(x != null ? { x, y } : {}), ...(hidden != null ? { hidden } : {}) };
    if (existing) return tokensFor(status).update(campaignId, existing.id, patch);
    return addToken(status, campaignId, { sceneId, characterId, x: x ?? 0.5, y: y ?? 0.85, hidden: hidden ?? false });
  }
  const { error } = await supabase.rpc('place_my_token', { p_scene_id: sceneId, p_character_id: characterId, p_x: x, p_y: y });
  if (error) throw error;
  return null;
}

// Where a PC stands on a scene nobody has placed them on yet: spread
// along the bottom edge.
export function partySpot(index, count) {
  return { x: Math.round(((index + 1) / (count + 1)) * 1000) / 1000, y: 0.85 };
}

// Where a newcomer (a monster, a walk-on) appears: the first free spot in
// rows across the top, so nobody lands on top of anyone already there.
export function openSpot(taken) {
  for (const y of [0.2, 0.34, 0.48, 0.08, 0.62]) {
    for (let i = 1; i <= 4; i += 1) {
      const x = i / 5;
      if (taken.every((t) => Math.hypot(t.x - x, (t.y - y) * 0.75) > 0.12)) return { x, y };
    }
  }
  return { x: 0.5, y: 0.5 };
}

export const clamp01 = (n) => Math.min(1, Math.max(0, n));

// A scene's grid, or null: { size } is one square's width as a fraction of
// the picture's width, { feet } what a square is worth (016).
export function gridOf(scene) {
  return scene?.gridSize ? { size: scene.gridSize, feet: scene.gridFeet || 5 } : null;
}

// Straight-line distance between two points on the picture (0–1
// fractions), in whole squares of the grid, in feet. `aspect` is the
// picture's width / height, since a y-fraction is of the height.
export function measureFeet(grid, aspect, a, b) {
  const squares = Math.hypot(b.x - a.x, (b.y - a.y) / aspect) / grid.size;
  return Math.round(squares) * grid.feet;
}

// ---------------------------------------------------------------------
// Marks on the map (019): doors, traps, loot, labels, spell areas.
// ---------------------------------------------------------------------
export function listMarks(status, campaignId) {
  return marksFor(status).list(campaignId);
}

export function addMark(status, campaignId, fields) {
  return marksFor(status).create(campaignId, { angle: 0, sizeFt: 5, label: null, color: null, dmOnly: false, ...fields });
}

export function updateMark(status, campaignId, id, patch) {
  return marksFor(status).update(campaignId, id, patch);
}

export function removeMark(status, campaignId, id) {
  return marksFor(status).remove(campaignId, id);
}

// ---------------------------------------------------------------------
// The event log
// ---------------------------------------------------------------------
const EVENT_LIMIT = 100;

export async function listEvents(status, campaignId) {
  // Lines are only ever appended, so the stored order is the true order
  // — sorting by timestamp would shuffle lines written in the same ms.
  if (status === 'guest') {
    try {
      const raw = JSON.parse(localStorage.getItem(localEventsKey(campaignId)) || '[]');
      return raw.reverse().slice(0, EVENT_LIMIT);
    } catch {
      return [];
    }
  }
  const { data, error } = await supabase
    .from('scene_events')
    .select('id, scene_id, kind, style, text, body, to_user, created_at')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .limit(EVENT_LIMIT);
  if (error) throw error;
  return data.map((e) => ({
    id: e.id,
    sceneId: e.scene_id,
    kind: e.kind,
    style: e.style || 'line',
    text: e.text,
    body: e.body,
    toUser: e.to_user,
    createdAt: e.created_at,
  }));
}

// `style` makes a line an announcement (017): a 'call' ("Roll
// initiative!"), a 'title' card (with `body` as its subtitle) or a
// 'handout' (with `body` as its text). `toUser` aims it at one player.
export async function logEvent(status, campaignId, { sceneId = null, kind = 'auto', style = 'line', text, body = null, toUser = null }) {
  const line = String(text || '').trim().slice(0, 500);
  if (!line) return;
  const more = body ? String(body).trim().slice(0, 8000) || null : null;
  if (status === 'guest') {
    await localEvents.create(campaignId, { sceneId, kind, style, text: line, body: more, toUser: null });
    return;
  }
  const { error } = await supabase.from('scene_events').insert({
    campaign_id: campaignId,
    scene_id: sceneId,
    kind,
    style,
    text: line,
    body: more,
    to_user: toUser,
  });
  if (error) throw error;
}

export async function clearEvents(status, campaignId) {
  if (status === 'guest') {
    localStorage.removeItem(localEventsKey(campaignId));
    return;
  }
  const { error } = await supabase.from('scene_events').delete().eq('campaign_id', campaignId);
  if (error) throw error;
}

// Plain-language lines for what just happened. Health reads as a band
// ("Bloodied"), never numbers — the log is read by the whole table, and a
// monster's exact HP stays with the DM.
export function hpEventText(name, before, after, max) {
  if (max == null || before === after) return null;
  if (before > 0 && after <= 0) return `${name} falls!`;
  if (before <= 0 && after > 0) return `${name} is back on their feet.`;
  const was = healthDescriptor(before, max);
  const now = healthDescriptor(after, max);
  if (was === now) return null;
  return now === 'Healthy' ? `${name} looks healthy again.` : `${name} is ${now.toLowerCase()}.`;
}

export const conditionEventText = (name, label, added) =>
  added ? `${name} is ${label.toLowerCase()}.` : `${name} is no longer ${label.toLowerCase()}.`;

// ---------------------------------------------------------------------
// Background pictures — the private "scenes" bucket online, a data: URL
// on the scene itself offline (smaller, since localStorage is tight).
// ---------------------------------------------------------------------
const BUCKET = 'scenes';
const ART_MAX = 1920;
const OFFLINE_ART_MAX = 1024;
const LINK_SECONDS = 60 * 60;
const links = new Map();

const isDataUrl = (path) => typeof path === 'string' && path.startsWith('data:');

// Ready-made backdrops (public/backdrops/*.svg), stored on a scene as
// "builtin:<id>" instead of an uploaded picture (017). Top-down, so tokens
// and the grid mean something on them.
export const BACKDROPS = [
  { id: 'tavern', name: 'Tavern' },
  { id: 'forest-road', name: 'Forest road' },
  { id: 'cave', name: 'Cave' },
  { id: 'dungeon-room', name: 'Dungeon room' },
  { id: 'city-street', name: 'City street' },
  { id: 'ship-deck', name: 'Ship deck' },
  { id: 'castle-hall', name: 'Castle hall' },
  { id: 'campfire', name: 'Campfire' },
];

const BUILTIN = 'builtin:';
export const builtinPath = (id) => `${BUILTIN}${id}`;
const isBuiltin = (path) => typeof path === 'string' && path.startsWith(BUILTIN);
export const backdropUrl = (id) => `${import.meta.env.BASE_URL}backdrops/${id}.svg`;

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function renderArt(img, maxSide, quality) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  let blob = await canvasBlob(canvas, 'image/webp', quality);
  if (!blob || blob.type !== 'image/webp') blob = await canvasBlob(canvas, 'image/jpeg', quality);
  if (!blob) throw new Error("Couldn't prepare that picture — try another one.");
  return blob;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Couldn't prepare that picture — try another one."));
    reader.readAsDataURL(blob);
  });
}

async function deleteArt(path) {
  if (!path || isDataUrl(path) || isBuiltin(path)) return;
  links.delete(path);
  try {
    await supabase.storage.from(BUCKET).remove([path]);
  } catch {
    /* an orphaned file costs a little storage, never access */
  }
}

export async function setSceneBackground(status, campaignId, scene, file) {
  const img = await loadImageFile(file);
  if (status === 'guest') {
    const dataUrl = await blobToDataUrl(await renderArt(img, OFFLINE_ART_MAX, 0.75));
    try {
      return await localScenes.update(campaignId, scene.id, { backgroundPath: dataUrl });
    } catch {
      throw new Error("This device is out of room for another picture — remove an old scene's picture first.");
    }
  }
  const blob = await renderArt(img, ART_MAX, 0.82);
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `campaigns/${campaignId}/scenes/${scene.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
  if (error) throw error;
  const updated = await remoteScenes.update(campaignId, scene.id, { backgroundPath: path });
  await deleteArt(scene.backgroundPath);
  return updated;
}

export async function clearSceneBackground(status, campaignId, scene) {
  const updated = await scenesFor(status).update(campaignId, scene.id, { backgroundPath: null });
  await deleteArt(scene.backgroundPath);
  return updated;
}

export function explainArtError(err) {
  const message = err?.message || '';
  if (/bucket not found/i.test(message) || /background_path/i.test(message)) return SCENE_MIGRATION_HINT;
  if (/row-level security|unauthorized|403/i.test(message)) return 'Only the DM can change a scene’s picture.';
  if (/payload too large|exceeded the maximum/i.test(message)) return 'That picture is still too big — try a smaller one.';
  if (/fetch|network/i.test(message)) return "Couldn't reach the server — check your connection and try again.";
  return message || "Couldn't save that picture — try again.";
}

function cachedArt(path) {
  if (!path) return null;
  if (isDataUrl(path)) return path;
  if (isBuiltin(path)) return backdropUrl(path.slice(BUILTIN.length));
  const hit = links.get(path);
  return hit && hit.expires > Date.now() ? hit.url : null;
}

export function useSceneArt(path) {
  const cached = cachedArt(path);
  const [fetched, setFetched] = useState({ path: null, url: null });
  useEffect(() => {
    if (!path || cached) return undefined;
    let live = true;
    supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, LINK_SECONDS)
      .then(({ data }) => {
        const url = data?.signedUrl || null;
        if (url) links.set(path, { url, expires: Date.now() + (LINK_SECONDS - 600) * 1000 });
        if (live) setFetched({ path, url });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [path, cached]);
  return cached || (fetched.path === path ? fetched.url : null);
}
