import { createClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL;
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// A pasted-with-a-typo VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY (a
// stray quote character, a trailing slash or /rest/v1 tacked on, leading/
// trailing whitespace from a copy-paste) used to fail silently here — it
// produced a client that looked configured but wasn't, surfacing only as
// a raw, unexplained fetch/URL error the moment someone actually
// submitted the sign-up form (this is almost certainly what an earlier
// "Invalid path specified in request URL" report actually was), or —
// worse for debugging on mobile with no console access — as nothing more
// than the generic "needs a configured backend" message, indistinguishable
// from never having configured it at all. describeUrlProblem/
// describeKeyProblem return the *specific* thing that's wrong so it can
// be shown directly on-screen (see requireBackend() in session.js)
// instead of requiring dev tools to diagnose.
function describeUrlProblem(candidate) {
  if (!candidate) return null; // absent entirely isn't an error — that's normal Guest-only mode
  const trimmed = candidate.trim();
  if (trimmed !== candidate) return 'has leading or trailing whitespace';
  if (/['"]/.test(trimmed)) return 'contains a literal quote character';
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return "isn't a valid URL — did you forget the https:// ?";
  }
  if (parsed.protocol !== 'https:') return 'must start with https://';
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    return `has a path (“${parsed.pathname}”) on it — it should be just the bare Project URL, not /rest/v1 or similar`;
  }
  return null;
}

function describeKeyProblem(candidate) {
  if (!candidate) return null;
  const trimmed = candidate.trim();
  if (trimmed !== candidate) return 'has leading or trailing whitespace';
  if (/['"]/.test(trimmed)) return 'contains a literal quote character';
  if (trimmed.split('.').length !== 3) {
    return "doesn't look like a Supabase key — it should be three dot-separated segments (a JWT), starting with “eyJ”";
  }
  return null;
}

const urlProblem = describeUrlProblem(rawUrl);
const keyProblem = describeKeyProblem(rawKey);

// The specific, user-facing reason a *configured-but-broken* backend is
// unavailable — see requireBackend() in session.js, which shows this
// instead of the generic "needs a configured backend" message whenever
// it's non-null. Stays null when nothing is configured at all (normal
// Guest-only mode) or when both values look structurally fine.
export const supabaseConfigError = urlProblem
  ? `Your Supabase URL ${urlProblem}. Check Settings → API → Project URL on Supabase and paste it exactly as-is into Vercel's environment variables, then redeploy.`
  : keyProblem
    ? `Your Supabase anon key ${keyProblem}. Check Settings → API → anon public key on Supabase and paste it exactly as-is into Vercel's environment variables, then redeploy.`
    : null;

if (supabaseConfigError) {
  // Still worth a console.error too, for anyone who *can* check —
  // supabaseConfigError alone only reaches whoever happens to open the
  // login screen.
  console.error(supabaseConfigError);
}

const url = urlProblem ? undefined : rawUrl;
const key = keyProblem ? undefined : rawKey;

// Both env vars are absent until the setup in db/schema.sql has been run
// and the two keys added (see README.md). Until then the app runs in
// Guest-only mode — see lib/session.js — which is a permanent feature,
// not just a placeholder (BIBLE.md §4), so this is never a crash path.
export const hasBackend = Boolean(url && key);

// What an emailed auth link (signup confirmation, password reset) handed
// back in the URL. Read here, synchronously, *before* createClient() —
// the client processes and clears the URL asynchronously once it starts.
//   - error: a failed link (expired, already used) comes back as
//     `#error=…&error_code=otp_expired&error_description=…`. The client
//     just drops it, so without this the visitor lands on Home with no
//     idea why nothing happened.
//   - recovery: `type=recovery` in the hash means a password-reset link,
//     wherever it landed — if the deployed URL isn't in Supabase's
//     Redirect URLs allow-list, it lands on the Site URL root instead of
//     /reset-password, and the visitor would otherwise just be silently
//     logged in without ever being asked for a new password.
function readAuthRedirect() {
  if (typeof window === 'undefined') return { error: null, recovery: false };
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  const code = hash.get('error_code') || query.get('error_code');
  const description = hash.get('error_description') || query.get('error_description');
  const failed = Boolean(code || hash.get('error') || query.get('error'));
  if (failed) {
    // Clear the error params so a reload doesn't show it again. Only ever
    // on the failure path — a successful link's tokens are left for the
    // client to consume.
    const clean = new URL(window.location.href);
    clean.hash = '';
    ['error', 'error_code', 'error_description'].forEach((k) => clean.searchParams.delete(k));
    window.history.replaceState(null, '', clean.toString());
  }
  let error = null;
  if (failed) {
    error =
      code === 'otp_expired'
        ? 'That email link has expired or was already used — request a fresh one.'
        : `That email link didn't work${description ? ` (${description})` : ''} — request a fresh one.`;
  }
  return { error, recovery: hash.get('type') === 'recovery' };
}

export const authRedirect = readAuthRedirect();

export const supabase = hasBackend ? createClient(url, key) : null;
