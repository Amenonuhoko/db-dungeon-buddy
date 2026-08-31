import { hasBackend, supabase } from './supabase';

// Everything the app needs to know "who is at the table right now" lives
// behind this module — see BIBLE.md §4. Two independent things:
//
//   - Guest sessions: no account, no network — a display name and a role
//     ('dm' | 'player') held in localStorage on this device only. This is
//     always available, backend configured or not.
//   - Account sessions: real Supabase Auth, used when hasBackend is true.
//     Role for an account is per-campaign (campaign_members.role), not
//     stored here — see BIBLE.md §7 once campaigns exist.

const GUEST_KEY = 'codex.guest';

export function getGuestSession() {
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function startGuestSession(displayName, role) {
  const guest = { displayName, role };
  localStorage.setItem(GUEST_KEY, JSON.stringify(guest));
  return guest;
}

export function clearGuestSession() {
  localStorage.removeItem(GUEST_KEY);
}

// ---------------------------------------------------------------------
// Account auth — thin wrappers so screens never touch `supabase` (or its
// absence) directly.
// ---------------------------------------------------------------------

function requireBackend() {
  if (!hasBackend) {
    throw new Error('Account login needs a configured backend — see app/.env.example.');
  }
}

export async function signUp(email, password, displayName) {
  requireBackend();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  requireBackend();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// A real Supabase Auth session (auth.uid() works, RLS applies exactly as
// it does for a full account) with no email/password — the "join a
// campaign as a player, no account needed" path from BIBLE.md §4. Needs
// Anonymous Sign-ins turned on in the Supabase project's Auth settings;
// db/migrations/003_anonymous_players.sql covers the one schema change
// it requires (a display-name fallback for users with no email).
export async function signInAnonymously(displayName) {
  requireBackend();
  const { data, error } = await supabase.auth.signInAnonymously({
    options: { data: { display_name: displayName } },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  if (!hasBackend) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function getCurrentUser() {
  if (!hasBackend) return Promise.resolve(null);
  return supabase.auth.getSession().then(({ data }) => data.session?.user ?? null);
}

// Fires immediately with the current user, then again on every auth
// change. Returns an unsubscribe function.
export function onAuthChange(callback) {
  if (!hasBackend) {
    callback(null);
    return () => {};
  }
  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
  return () => sub.subscription.unsubscribe();
}
