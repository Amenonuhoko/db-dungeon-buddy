import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Both env vars are absent until the setup in db/schema.sql has been run
// and the two keys added (see README.md). Until then the app runs in
// Guest-only mode — see lib/session.js — which is a permanent feature,
// not just a placeholder (BIBLE.md §4), so this is never a crash path.
export const hasBackend = Boolean(url && key);
export const supabase = hasBackend ? createClient(url, key) : null;
