import { createClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// A pasted-with-a-typo VITE_SUPABASE_URL (a stray quote character, a
// trailing slash duplicated, `/rest/v1` tacked on instead of the bare
// project URL, leading/trailing whitespace from a copy-paste) doesn't
// fail loudly here — it produces a Supabase client that looks fine until
// someone actually submits the sign-up form, where it surfaces as a raw,
// unexplained fetch/URL error (this is what the "Invalid path specified
// in request URL" report earlier turned out to almost certainly be).
// Catching the obviously-malformed shapes here means a bad env var falls
// back to Guest-only mode — a real, permanent, working feature per
// BIBLE.md §4 — instead of a broken "looks configured but isn't" client
// a user could walk straight into mid-signup.
function isLikelyValidSupabaseUrl(candidate) {
  if (!candidate) return false;
  const trimmed = candidate.trim();
  if (trimmed !== candidate) return false; // stray leading/trailing whitespace
  if (/['"]/.test(trimmed)) return false; // a literal quote character copied in
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.pathname !== '/' && parsed.pathname !== '') return false; // e.g. a stray /rest/v1
  return true;
}

const urlIsValid = isLikelyValidSupabaseUrl(rawUrl);
if (rawUrl && !urlIsValid) {
  // Only reachable with the env var actually set but malformed — worth a
  // loud console warning for whoever configured it, since the app itself
  // will otherwise just look like it's silently running in Guest mode.
  console.error(
    `VITE_SUPABASE_URL doesn't look like a valid Supabase project URL (got: ${JSON.stringify(rawUrl)}). ` +
      'It should be exactly the "Project URL" from Settings → API — no quotes, no trailing path, no extra whitespace. ' +
      'Falling back to Guest-only mode until this is fixed.',
  );
}

const url = urlIsValid ? rawUrl : undefined;

// Both env vars are absent until the setup in db/schema.sql has been run
// and the two keys added (see README.md). Until then the app runs in
// Guest-only mode — see lib/session.js — which is a permanent feature,
// not just a placeholder (BIBLE.md §4), so this is never a crash path.
export const hasBackend = Boolean(url && key);
export const supabase = hasBackend ? createClient(url, key) : null;
