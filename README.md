# Codex

A browser PWA companion for running and playing a full D&D campaign —
world-building and bestiary tools for the DM, character sheets and notes
for players, a shared searchable encyclopedia, and battle tracking, all
in one installable app.

**Start here:** [`BIBLE.md`](BIBLE.md) is the project's living reference
doc — vision, tech stack, visual design system, data model, and feature
roadmap. Read it before making a product or architecture call.

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
   (`001_core.sql` → `004_character_sheets.sql`, and onward as new ones
   land). Together they create `profiles`, `campaigns`,
   `campaign_members`, `encyclopedia_entries`, `bestiary_entries`,
   `notes`, `character_sheets`, and `character_conditions`, with the
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
8. Turn **off** "Confirm email" under **Authentication → Providers →
   Email**. Account signup (`BIBLE.md` §4) uses username/password under
   the hood via a synthetic, undeliverable email address — if email
   confirmation is required, every new signup gets stuck waiting on a
   confirmation link that can never arrive.

(Unlike `little-bonfire`, there's no `SUPABASE_SERVICE_ROLE_KEY` yet —
auth and campaign membership are handled by Supabase Auth and guarded
Postgres functions with Row Level Security, not a serverless write path.
That will change once a feature needs server-side logic beyond what RLS
can express — see `BIBLE.md` §5.)
