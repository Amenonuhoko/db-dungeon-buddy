import { authRedirect, hasBackend, supabase, supabaseConfigError } from './supabase';

// Everything the app needs to know "who is at the table right now" lives
// behind this module — see BIBLE.md §4. Two independent things:
//
//   - Guest sessions: no account, no network — a display name and a role
//     ('dm' | 'player') held in localStorage on this device only. This is
//     always available, backend configured or not.
//   - Account sessions: real Supabase Auth, used when hasBackend is true.
//     Role for an account is per-campaign (campaign_members.role), not
//     stored here — see BIBLE.md §7 once campaigns exist.

// Storage keys keep the app's original working name ("Codex") on purpose:
// renaming them would silently orphan every guest's saved data, and no one
// ever sees them. Same for the other codex.* keys (campaigns.js,
// contentStore.js, theme.js).
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

// Where Supabase should send someone back to after clicking an emailed
// link (confirmation or password-reset) — the deployed app's own origin
// plus its base path (matches the `basename` App.jsx gives BrowserRouter,
// so this works the same whether the app is served from a domain's root
// or a subpath like GitHub Pages' `/repo-name/`).
function redirectTo(path) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${window.location.origin}${base}${path}`;
}

// A real account used to mean a real email address collected up front —
// nobody wants to give one just to sit down at the table, so an earlier
// version of this module mapped a username to a synthetic, undeliverable
// address instead (see the git history / BIBLE.md §4 for the full
// account of why that got reverted: live testing showed Supabase Auth's
// server-side validator rejects an email domain that doesn't have real,
// resolving DNS — confirmed against *two* different invented domains,
// which rules out "pick a better fake domain" as a fix). Real email is
// back, but the constraint it was trying to avoid is worth keeping in
// mind: an email address is the login identifier, not automatically the
// display name shown at the table, so signup collects both separately.
export function emailError(email) {
  const trimmed = email.trim();
  if (!trimmed) return 'Email is required.';
  // Deliberately loose — an accurate email regex is famously not worth
  // writing by hand, and the input's own type="email" already blocks the
  // obviously-malformed cases before this ever runs. This is a backstop
  // for a form submitted programmatically or a validation attribute
  // stripped some other way, not the real check (Supabase's own is).
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "That doesn't look like a valid email address.";
  return null;
}

export function displayNameError(name) {
  const trimmed = name.trim();
  // Matches profiles.display_name's own check constraint
  // (db/migrations/001_core.sql) — catching it here means a too-long
  // name fails with a plain message before the network call, not a raw
  // Postgres constraint-violation error after.
  if (trimmed.length < 1 || trimmed.length > 60) return 'Display name must be 1-60 characters.';
  return null;
}

// Maps a raw Supabase Auth error to something a non-technical player can
// actually act on. Two things this exists to prevent: (1) a network
// hiccup or rate limit reading as a dead end ("Failed to fetch") instead
// of "try again"; (2) an unrecognized error hiding the real reason —
// unlike an early version of this function, the fallback below no longer
// *hides* the detail, it appends it (with the HTTP status if there is
// one). Debugging a live signup failure over chat with someone who has
// no dev tools access proved that "try again in a moment" alone isn't
// enough to go on.
function friendlyAuthError(error, fallback) {
  const message = error?.message || '';
  if (/already registered/i.test(message)) {
    return new Error('That email is already registered — log in instead, or use "Forgot password?" if you need to reset it.');
  }
  if (/invalid login credentials/i.test(message)) return new Error('Incorrect email or password.');
  // A real, working "Confirm email" setting (BIBLE.md §4) is exactly why
  // real email is worth the signup friction — this is the expected,
  // recoverable state right after signing up, not a dead end.
  if (/email not confirmed/i.test(message)) {
    // `kind` lets AuthScreen offer "Resend confirmation email" right
    // there instead of leaving the visitor to wonder where it went.
    return Object.assign(new Error('Check your inbox (and spam folder) for the confirmation link, then log in again.'), {
      kind: 'email_not_confirmed',
    });
  }
  // Supabase's built-in mailer (no custom SMTP configured) only delivers
  // to addresses on the Supabase project's own team, ~2 an hour — anyone
  // else gets "Email address not authorized" or "Error sending … email".
  // Not something the person signing up can fix, so say who can.
  if (/not authorized/i.test(message) || /error sending .*email/i.test(message)) {
    return new Error(
      "Couldn't send email to that address. (Whoever runs this backend: Supabase's built-in mailer only emails your own Supabase team — set up custom SMTP under Authentication → Emails, or turn off \"Confirm email\" for signups.)",
    );
  }
  // Whoever runs this campaign's backend turned off new sign-ups
  // entirely (Authentication → Sign In / Providers in Supabase) — not
  // something a player can fix, so say so plainly instead of showing a
  // raw "not allowed" error.
  if (/sign[- ]?ups?.{0,15}not allowed/i.test(message)) {
    return new Error(
      "Sign-ups are turned off for this campaign's backend right now — ask whoever runs it to enable them under Authentication in Supabase, or continue as Guest.",
    );
  }
  // Order matters here: a too-long password error also contains "password"
  // and often "character", so it has to be checked before the too-short
  // branch below or it would show the exact opposite advice.
  if (/password/i.test(message) && /(more than|maximum|too long|longer)/i.test(message)) {
    return new Error('Password is too long — keep it under 72 characters.');
  }
  if (/password/i.test(message) && /(least|character|short|weak)/i.test(message)) {
    return new Error('Password must be at least 6 characters.');
  }
  if (/rate limit|too many/i.test(message)) return new Error('Too many attempts — wait a minute and try again.');
  if (/fetch|network|NetworkError/i.test(message) || error?.name === 'TypeError') {
    return new Error("Couldn't reach the server — check your connection and try again.");
  }
  console.error('Auth error:', error);
  const status = error?.status ? ` [${error.status}]` : '';
  return new Error(message ? `${fallback} (${message}${status})` : `${fallback}${status}`);
}

export async function signUp(email, password, displayName) {
  requireBackend();
  const problem = emailError(email) || displayNameError(displayName);
  if (problem) throw new Error(problem);
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: { display_name: displayName.trim() },
      emailRedirectTo: redirectTo('/'),
    },
  });
  if (error) throw friendlyAuthError(error, "Couldn't create that account — try again in a moment.");
  return data;
}

export async function signIn(email, password) {
  requireBackend();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw friendlyAuthError(error, "Couldn't log in — try again in a moment.");
  return data;
}

// Sends a password-reset email — the thing a synthetic email address
// could never do (BIBLE.md §4). Always resolves without error even for
// an email that isn't registered: Supabase itself doesn't distinguish
// ("Password Recovery" is sent either way) specifically so this can't be
// used to probe which addresses have accounts, and the UI shouldn't
// either — same "Check your email" message regardless.
export async function requestPasswordReset(email) {
  requireBackend();
  const problem = emailError(email);
  if (problem) throw new Error(problem);
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: redirectTo('/reset-password'),
  });
  if (error) throw friendlyAuthError(error, "Couldn't send that reset email — try again in a moment.");
}

// Supabase only lets the same address be re-sent a confirmation once a
// minute; AuthScreen enforces that cooldown on its side too, so the
// button can't be mashed into a rate-limit error.
export const RESEND_COOLDOWN_SECONDS = 60;

export async function resendConfirmation(email) {
  requireBackend();
  const problem = emailError(email);
  if (problem) throw new Error(problem);
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: email.trim(),
    options: { emailRedirectTo: redirectTo('/') },
  });
  if (error) throw friendlyAuthError(error, "Couldn't resend the confirmation email — try again in a moment.");
}

// Fires when a password-reset link has just signed the visitor in (the
// client's PASSWORD_RECOVERY event) — App.jsx uses it to route to the
// new-password form wherever the link happened to land.
export function onPasswordRecovery(callback) {
  if (!hasBackend) return () => {};
  const { data: sub } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') callback();
  });
  return () => sub.subscription.unsubscribe();
}

// A failed emailed link (see authRedirect in lib/supabase.js), shown once
// on whichever screen the visitor lands on until they dismiss it. Kept in
// module scope, not read-and-cleared, so React StrictMode's double-run of
// state initializers can't swallow it.
let pendingRedirectError = authRedirect.error;

export function getAuthRedirectError() {
  return pendingRedirectError;
}

export function dismissAuthRedirectError() {
  pendingRedirectError = null;
}

export const landedFromRecoveryLink = authRedirect.recovery;

// The second half of the reset flow — called from ResetPasswordScreen
// once the emailed link has landed the browser in a recovery session
// (supabase-js exchanges the link's token for one automatically; see
// that screen for how it confirms the session is actually a recovery
// one before showing the form). Requires 6+ characters the same as
// signup — Supabase itself enforces this project-wide, so a mismatch
// here would just be this constant drifting from that setting, not a
// deliberate difference.
export async function updatePassword(newPassword) {
  requireBackend();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw friendlyAuthError(error, "Couldn't update the password — try again in a moment.");
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
