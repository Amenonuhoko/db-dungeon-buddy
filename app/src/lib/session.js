import { hasBackend, supabase, supabaseConfigError } from './supabase';

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
    // supabaseConfigError is only set when a VITE_SUPABASE_* var is
    // present but structurally wrong (see lib/supabase.js) — a much more
    // useful thing to show than the generic message below when that's
    // the actual situation, since "needs a configured backend" reads
    // identically whether nothing was ever set up or someone configured
    // it with one typo. No dev tools needed to see this one — it's the
    // error message the login screen shows.
    throw new Error(supabaseConfigError || 'Account login needs a configured backend — see app/.env.example.');
  }
}

// Supabase Auth is built around email/password — usernames aren't a
// native identity type. Rather than pull in a different backend, we
// deterministically map a username to a synthetic address under a
// dedicated domain so the same Auth/RLS machinery still applies, but
// nobody ever sees or types an email. The tradeoff this accepts: there's
// no email to send a password-reset link to (see BIBLE.md §4).
//
// This used to be a reserved (RFC 2606) `.invalid` TLD — the textbook-
// correct choice for "guaranteed never a real, deliverable domain" — but
// live testing (2026-09) showed Supabase Auth's own server-side email
// validator rejects it outright with "Email address ... is invalid"
// (400), before the request ever reaches our trigger or the network
// error handling below. GoTrue validates the domain against a real
// top-level-domain list, and `.invalid` — precisely because it's
// reserved to never be a real, registerable TLD — isn't on it. A real
// TLD is required to pass that check, so this is *not* a domain we
// control or that resolves to anything; it just needs to look
// structurally like one Supabase's validator accepts. Confirm-email
// stays OFF (see BIBLE.md §4) specifically so no mail is ever actually
// sent here — if that ever changed, the domain would need to be one we
// genuinely own instead.
// Same function used for both signup and login, so login is
// case/whitespace-insensitive to whatever the account was created with.
const USERNAME_EMAIL_DOMAIN = 'accounts.codex-companion.com';

export function usernameToEmail(username) {
  const slug = username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug}@${USERNAME_EMAIL_DOMAIN}`;
}

// A username that's technically valid against AuthScreen's pattern
// attribute (letters/digits/underscore/hyphen, 3-20 chars) can still
// collapse to an empty local-part once usernameToEmail strips leading/
// trailing hyphens — "---" is a real example. That produces a
// structurally invalid email Supabase will reject with a raw, confusing
// error, so catch it here — one place, checked before either signUp or
// signIn ever reaches the network — instead of only in the form's regex.
export function usernameError(username) {
  const trimmed = username.trim();
  if (trimmed.length < 3 || trimmed.length > 20) return 'Username must be 3-20 characters.';
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    return 'Username can only use letters, numbers, underscores, and hyphens.';
  }
  if (!usernameToEmail(trimmed).split('@')[0]) {
    return 'That username is all separators — add a letter or number.';
  }
  return null;
}

// Maps a raw Supabase Auth error to something a non-technical player can
// actually act on. Two things this exists to prevent: (1) a raw error
// message mentioning the synthetic @accounts.codex-companion.com address
// ever reaching the screen — nobody typed an email, so seeing one back is
// alarming and unexplained; (2) a network hiccup or rate limit reading as
// a dead end ("Failed to fetch") instead of "try again."
//
// Anything not specifically recognized still leads with a friendly
// fallback, but — unlike an earlier version of this function — no longer
// *hides* the real reason: it's appended in parentheses (with the HTTP
// status if there is one), sanitized so the synthetic domain can't leak
// through. This is what "diagnosable without dev tools" actually
// requires: debugging a live signup failure over chat with someone who
// can't open a console proved a plain "try again in a moment" isn't
// enough to go on — the real error also needs to reach the person who
// hit it, not just the console they can't see.
function friendlyAuthError(error, fallback) {
  const message = error?.message || '';
  if (/already registered/i.test(message)) return new Error('That username is already taken — try another.');
  if (/invalid login credentials/i.test(message)) return new Error('Unknown username or wrong password.');
  if (/password/i.test(message) && /(least|character|short|weak)/i.test(message)) {
    return new Error('Password must be at least 6 characters.');
  }
  if (/rate limit|too many/i.test(message)) return new Error('Too many attempts — wait a minute and try again.');
  if (/fetch|network|NetworkError/i.test(message) || error?.name === 'TypeError') {
    return new Error("Couldn't reach the server — check your connection and try again.");
  }
  console.error('Auth error:', error);
  const detail = message ? message.replaceAll(USERNAME_EMAIL_DOMAIN, '(internal)') : null;
  const status = error?.status ? ` [${error.status}]` : '';
  return new Error(detail ? `${fallback} (${detail}${status})` : `${fallback}${status}`);
}

export async function signUp(username, password) {
  requireBackend();
  const usernameProblem = usernameError(username);
  if (usernameProblem) throw new Error(usernameProblem);
  const { data, error } = await supabase.auth.signUp({
    email: usernameToEmail(username),
    password,
    options: { data: { display_name: username.trim() } },
  });
  if (error) throw friendlyAuthError(error, "Couldn't create that account — try again in a moment.");
  return data;
}

export async function signIn(username, password) {
  requireBackend();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });
  if (error) throw friendlyAuthError(error, "Couldn't log in — try again in a moment.");
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
