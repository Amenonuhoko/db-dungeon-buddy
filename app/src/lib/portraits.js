import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// Character portraits (db/migrations/014_portraits.sql). Online, a
// portrait is a file in the private "portraits" bucket and the character
// row stores its path (`portraitPath`):
//
//   campaigns/<campaign>/sheets/<sheet>/<random>.webp  — a campaign sheet
//   users/<owner>/roster/<roster id>/<random>.webp     — My Characters
//
// and it's shown through a short-lived signed link, fetched in batches
// and cached here. Offline there's no bucket: the (smaller) picture is
// kept on the character itself as a data: URL in the same field.
//
// Pictures are cropped square and shrunk on the device before they go
// anywhere (renderPortrait below), so a phone photo becomes ~40 KB.
const BUCKET = 'portraits';
export const PORTRAIT_SIZE = 512;
export const OFFLINE_PORTRAIT_SIZE = 256;
const LINK_SECONDS = 60 * 60;

export const isDataUrl = (path) => typeof path === 'string' && path.startsWith('data:');

// ---------------------------------------------------------------------
// Signed links: every portrait asked for in the same tick goes out in one
// request; links are reused until ten minutes before they expire.
// ---------------------------------------------------------------------
const links = new Map(); // path -> { url, expires }
const pending = new Map(); // path -> [resolve]
let flushTimer = null;

async function flush() {
  flushTimer = null;
  const batch = new Map(pending);
  pending.clear();
  const paths = [...batch.keys()];
  let results = [];
  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, LINK_SECONDS);
    if (!error) results = data || [];
  } catch {
    /* offline, or no bucket yet — everyone gets the initials instead */
  }
  const byPath = new Map(results.filter((r) => r.signedUrl && !r.error).map((r) => [r.path, r.signedUrl]));
  const expires = Date.now() + (LINK_SECONDS - 600) * 1000;
  for (const [path, resolvers] of batch) {
    const url = byPath.get(path) || null;
    if (url) links.set(path, { url, expires });
    for (const resolve of resolvers) resolve(url);
  }
}

export function portraitLink(path) {
  if (!path) return Promise.resolve(null);
  if (isDataUrl(path)) return Promise.resolve(path);
  const cached = links.get(path);
  if (cached && cached.expires > Date.now()) return Promise.resolve(cached.url);
  return new Promise((resolve) => {
    if (!pending.has(path)) pending.set(path, []);
    pending.get(path).push(resolve);
    if (!flushTimer) flushTimer = setTimeout(flush, 0);
  });
}

function cachedLink(path) {
  if (!path) return null;
  if (isDataUrl(path)) return path;
  const cached = links.get(path);
  return cached && cached.expires > Date.now() ? cached.url : null;
}

// The <img> src for a portrait path, or null while loading / if there's
// none (callers show initials instead).
export function usePortraitSrc(path) {
  const [fetched, setFetched] = useState({ path: null, url: null });
  const immediate = cachedLink(path);
  useEffect(() => {
    if (!path || immediate) return undefined;
    let live = true;
    portraitLink(path).then((url) => {
      if (live) setFetched({ path, url });
    });
    return () => {
      live = false;
    };
  }, [path, immediate]);
  return immediate || (fetched.path === path ? fetched.url : null);
}

// ---------------------------------------------------------------------
// Turning a chosen file into a square picture.
// ---------------------------------------------------------------------
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

export function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type || 'image/')) {
      reject(new Error("That isn't a picture — choose a JPEG, PNG or WebP image."));
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      reject(new Error('That picture is too big to work with — choose one under 25 MB.'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that picture — try a JPEG or PNG."));
    };
    img.src = url;
  });
}

// crop = { zoom (1 = the short side just fits), cx, cy (centre, in image
// pixels) }. The largest square that zoom allows, clamped inside the image.
export function cropSquare(img, crop) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const side = Math.min(w, h) / Math.max(1, crop.zoom);
  const cx = Math.min(w - side / 2, Math.max(side / 2, crop.cx ?? w / 2));
  const cy = Math.min(h - side / 2, Math.max(side / 2, crop.cy ?? h / 2));
  return { sx: cx - side / 2, sy: cy - side / 2, side, cx, cy };
}

export function drawCrop(canvas, img, crop, size) {
  const { sx, sy, side } = cropSquare(img, crop);
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

// WebP where the browser can make it (older Safari quietly hands back a
// PNG instead — then JPEG, which is far smaller than PNG for a photo).
export async function renderPortrait(img, crop, size = PORTRAIT_SIZE) {
  const canvas = document.createElement('canvas');
  drawCrop(canvas, img, crop, size);
  let blob = await canvasBlob(canvas, 'image/webp', 0.85);
  if (!blob || blob.type !== 'image/webp') blob = await canvasBlob(canvas, 'image/jpeg', 0.85);
  if (!blob) throw new Error("Couldn't prepare that picture — try another one.");
  return blob;
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Couldn't prepare that picture — try another one."));
    reader.readAsDataURL(blob);
  });
}

// ---------------------------------------------------------------------
// Storage.
// ---------------------------------------------------------------------
const extensionFor = (type) => (type === 'image/webp' ? 'webp' : type === 'image/png' ? 'png' : 'jpg');

export const sheetPortraitFolder = (campaignId, sheetId) => `campaigns/${campaignId}/sheets/${sheetId}`;
export const rosterPortraitFolder = (userId, rosterId) => `users/${userId}/roster/${rosterId}`;

function newName(folder, type) {
  return `${folder}/${crypto.randomUUID()}.${extensionFor(type)}`;
}

export function explainPortraitError(err) {
  const message = err?.message || '';
  if (/bucket not found/i.test(message) || err?.statusCode === '404' || /portrait_path/i.test(message) || err?.code === 'PGRST204') {
    return 'Portraits need the latest database update — whoever runs the backend should run db/migrations/014_portraits.sql (see README).';
  }
  if (/row-level security|unauthorized|403/i.test(message)) {
    return "Only this character's player or the DM can change their portrait.";
  }
  if (/payload too large|exceeded the maximum/i.test(message)) return 'That picture is still too big — try a smaller one.';
  if (/fetch|network/i.test(message)) return "Couldn't reach the server — check your connection and try again.";
  return message || "Couldn't save that portrait — try again.";
}

export async function uploadPortrait(folder, blob) {
  const path = newName(folder, blob.type);
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type,
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw error;
  return path;
}

// Best effort: an orphaned file only costs a little storage, never access.
export async function deletePortraitFile(path) {
  if (!path || isDataUrl(path)) return;
  links.delete(path);
  try {
    await supabase.storage.from(BUCKET).remove([path]);
  } catch {
    /* ignore */
  }
}

// Copy a portrait into another character's folder — bringing a My
// Characters entry into a campaign, or saving progress back. Returns the
// new path, or null if there was nothing to copy or it didn't work.
export async function copyPortrait(fromPath, toFolder) {
  if (!fromPath || isDataUrl(fromPath)) return null;
  const ext = fromPath.split('.').pop();
  const to = `${toFolder}/${crypto.randomUUID()}.${['webp', 'jpg', 'png'].includes(ext) ? ext : 'webp'}`;
  try {
    const { error } = await supabase.storage.from(BUCKET).copy(fromPath, to);
    return error ? null : to;
  } catch {
    return null;
  }
}
