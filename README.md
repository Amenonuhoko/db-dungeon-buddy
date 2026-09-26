# Dungeon Buddy

A browser PWA that helps a D&D table see the scene: players get one
live view of where the party stands on the DM's picture, with the fight
tracked on the tokens themselves, a running log of what happened, and
their character sheet a tap away. Behind it, the DM keeps full
world-building tools — lore, bestiary, notes, character sheets — all in
one installable app.

**Start here:** [`BIBLE.md`](BIBLE.md) is the project's living reference
doc — vision, tech stack, visual design system, data model, and feature
roadmap. Read it before making a product or architecture call.

## Look & feel

The design is taken from the Dungeon Buddy mascot (a red dragon hugging
a black d20): dragon-red accent, leather/parchment surfaces, brass trim,
rounded sticker-style buttons and cards. Details in `BIBLE.md` §3.

- **Mascot art:** `app/public/mascot.png` (512×512, transparent). It's
  the Home screen's hero image and the 512px app icon.
- **App icons:** `icon-192.png`, `icon-maskable-512.png` and
  `apple-touch-icon.png` are rendered from the mascot, so re-render them
  if it changes. The browser-tab favicon is the simpler d20
  (`icon.svg`), which stays readable at 16px.

## Stack

React + Vite, installable as a PWA. Persistence is Supabase (Postgres +
Auth) when configured, with a full **Guest mode** local fallback so the
app works with zero setup — see `BIBLE.md` §4. Hosting is Vercel (writes
and auth go through its serverless functions/Supabase directly) with a
GitHub Pages deploy kept as a read-mostly static fallback.

## Development

```bash
cd app
npm install
npm run dev
```

This runs in Guest mode only — `/api/*` (serverless functions) aren't
served by plain `vite dev`, and no Supabase env vars are set yet. Guest
mode is fully featured (campaigns, encyclopedia, bestiary, notes all work
against `localStorage`), so this is enough for most day-to-day frontend
work. To exercise account login/signup and a real database, install the
[Vercel CLI](https://vercel.com/docs/cli) and run `vercel dev` from
`app/` instead, with `app/.env` filled in (see **Database setup**).

## Build

```bash
cd app
npm run build
```

## Hosting

**Vercel** is the primary target:

1. Import this repo into a new Vercel project.
2. Set its **Root Directory** to `app`. Vercel auto-detects the Vite
   framework preset — `app/vercel.json` supplies the security headers
   and the SPA rewrite (every path falls back to `index.html` so
   React Router, not Vercel's static file server, handles routes like
   `/login` or `/campaigns/:id` — without it, anything but the bare
   root 404s on a direct visit or a refresh).
3. Add the three env vars from **Database setup** below in the project's
   Settings → Environment Variables.
4. Push to `main` (or trigger a deploy) — Vercel builds and serves
   `app/dist`.

**GitHub Pages** (`.github/workflows/deploy.yml`) deploys on every push
to `main` as a second, static-only copy. It can read the same database
if `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are also added as GitHub
repo secrets, but Guest mode is unaffected either way — it never touches
the network.

## Database setup

Without the keys below, the app runs entirely in **Guest mode** — see
`BIBLE.md` §4. This is a permanent feature, not just a placeholder: guest
data lives only in that browser's `localStorage`.

1. Create a free project at [supabase.com](https://supabase.com).
2. In the project's SQL Editor, run every file under
   [`db/migrations/`](db/migrations) once, **in filename order**
   (`001_core.sql` → `020_npcs.sql`, and onward as new ones
   land). Every file is safe to re-run, so if you're not sure which ones
   an existing project has, run them all again in order. **007 matters
   for security** now that anyone with an invite link can join — see
   `BIBLE.md` §5. Together they create `profiles`, `campaigns`,
   `campaign_members`, `encyclopedia_entries`, `bestiary_entries`,
   `notes`, `character_sheets`, `character_conditions`, `encounters`,
   `encounter_combatants`, `dice_rolls`, `messages`, `party_items`,
   `party_coins`, `roster_characters`, `character_details`, `join_attempts`,
   `boards`, `scenes`, `scene_tokens`, `scene_events`, `scene_marks` and `npcs`, plus the private
   `portraits` (014) and `scenes` (015) storage buckets, with the
   triggers and RLS policies documented inline — see the comments in each
   file for what it does and why. New content types get their own
   numbered file here as they're built (see `BIBLE.md` §7) rather than
   editing old ones.
3. In the project's **Settings → API**, copy the **Project URL** and the
   **anon public** key.
4. Add them as env vars on the **Vercel** project (Settings →
   Environment Variables): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
5. If also keeping GitHub Pages up, add the same two as GitHub repo
   secrets (Settings → Secrets and variables → Actions).
6. For local dev, copy `app/.env.example` to `app/.env` and fill in both.
7. To let players join a campaign without creating an account (the
   `/join` screen, `BIBLE.md` §4), turn on **Anonymous sign-ins** under
   **Authentication → Sign In / Providers** in the Supabase dashboard —
   that's a project setting, not something the SQL migrations can flip.
   **Without it, invite links only work for people who already have an
   account** — everyone else gets "Joining without an account isn't
   switched on yet." Also leave CAPTCHA protection off (Authentication →
   Attack Protection); the join screen doesn't support it yet.
8. **Authentication → URL Configuration**: set **Site URL** to your
   deployed app (e.g. `https://your-app.vercel.app`) and add
   `https://your-app.vercel.app/**` under **Redirect URLs** (plus your
   preview-deployment pattern if you test on previews). Signup
   confirmation and password-reset emails link back through these —
   leave the default and they point at `http://localhost:3000`.
9. **Email delivery** — decide before anyone else signs up. Without
   custom SMTP, Supabase's built-in mailer only sends to addresses on
   your own Supabase org team, about 2 emails an hour; anyone else gets
   "Email address not authorized". Two options:
   - Turn **off** "Confirm email" (**Authentication → Sign In /
     Providers → Email**): signups land signed in immediately and no
     email is sent. Password reset still sends email, so it will only
     reach your team until you do the next option.
   - Or set up **custom SMTP** (**Authentication → Emails → SMTP
     Settings** — any provider works; Resend's free tier is the quickest).
     Then leave "Confirm email" on for the usual "click the link we
     emailed you" flow, and password reset works for everyone.

(Unlike `little-bonfire`, there's no `SUPABASE_SERVICE_ROLE_KEY` yet —
auth and campaign membership are handled by Supabase Auth and guarded
Postgres functions with Row Level Security, not a serverless write path.
That will change once a feature needs server-side logic beyond what RLS
can express — see `BIBLE.md` §5.)
