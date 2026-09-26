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

export const SCENE_TABLES = ['scenes', 'scene_tokens', 'scene_events'];

export function sceneMissing(error) {
  const msg = error?.message || '';
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    error?.code === 'PGRST202' ||
    (/scene/.test(msg) && /schema cache|does not exist|could not find/i.test(msg))
  );
}

export const SCENE_MIGRATION_HINT =
  'Scenes need the latest database update — whoever runs the backend should run db/migrations/015_scenes.sql (see README).';

// ---------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------
export function listScenes(status, campaignId) {
  return scenesFor(status).list(campaignId);
}

export function createScene(status, campaignId, name) {
  return scenesFor(status).create(campaignId, { name, active: false, backgroundPath: null, encounterId: null });
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
    .select('id, scene_id, kind, text, created_at')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .limit(EVENT_LIMIT);
  if (error) throw error;
  return data.map((e) => ({ id: e.id, sceneId: e.scene_id, kind: e.kind, text: e.text, createdAt: e.created_at }));
}

export async function logEvent(status, campaignId, { sceneId = null, kind = 'auto', text }) {
  const line = String(text || '').trim().slice(0, 500);
  if (!line) return;
  if (status === 'guest') {
    await localEvents.create(campaignId, { sceneId, kind, text: line });
    return;
  }
  const { error } = await supabase.from('scene_events').insert({ campaign_id: campaignId, scene_id: sceneId, kind, text: line });
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
  if (!path || isDataUrl(path)) return;
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
