# The Codex — Project Bible

This is the reference document for this project. Read it before making a
product, design, or architecture decision — it exists so every future
session (human or Claude) picks up the same intent instead of re-deriving
it. Update it whenever a decision here changes; it should always describe
the app as it actually is/should be, not just as it started.

Working name: **Codex** (a nod to Warframe's own in-game Codex — this app
*is* the table's encyclopedia, bestiary, and character archive in one
place). Easy to rename later; it isn't wired into anything structural.

## 1. Vision

A browser-based PWA that is a full companion for running and playing a
tabletop D&D campaign — not a dice-roller add-on, but a place a DM can
build a world in and players can live in during a session:

- One app, two hats: **Dungeon Master** tools (world-building, bestiary,
  encounter/battle tracking, campaign notes) and **Player** tools
  (character sheet, personal notes, shared encyclopedia access).
- Works standing at a table on a phone, or on a laptop running the show.
  Installable (PWA), and usable offline for anything that doesn't need
  live sync (see §6).
- No feature requires anything installed beyond a browser. No dedicated
  native app, no plugin.

## 2. Tech stack & architecture

This deliberately reuses the pattern already proven out in the
`little-bonfire` project (same author, same workflow), rather than
inventing a new one:

- **React + Vite** for the app shell (`app/`).
- **Supabase** (Postgres + Auth) as the hosted backend, when configured.
  The app runs and deploys fine before it's configured too — see the
  local/guest fallback in §4.
- **Vercel** is the primary hosting target, because it's the only one of
  the two hosts below that can run serverless functions — required for
  any write that needs a service-role key or server-side validation
  (see §5, Security).
- **GitHub Pages** (`.github/workflows/deploy.yml`) is kept as a second,
  static-only deploy on every push to the dev branch/`main`. It can read
  the same database if the two public env vars are set as repo secrets,
  but can never write to it (no serverless functions on Pages) — same
  posture as bonfire.
- **oxlint** for linting (`app/.oxlintrc.json`), same ruleset shape as
  bonfire.
- PWA installability via `vite-plugin-pwa` (manifest + service worker for
  static-asset caching). Data caching/offline behavior is hand-rolled per
  feature (see §6), not blanket-cached, because campaign data must never
  silently serve stale content across devices.

### Environments & workflow

Same three-tier setup as bonfire:

1. **Local, no backend configured** — `npm run dev` in `app/`. Runs
   entirely against an in-memory/localStorage fallback. This is also
   exactly how **Guest mode** works in production (see §4) — there is no
   separate "demo mode," guest mode *is* the no-backend code path.
2. **Local, full stack** — `vercel dev` from `app/` with `.env` filled in
   (see `app/.env.example`), to exercise real Supabase reads/writes and
   the serverless functions together.
3. **Deployed** — push to the dev branch. Vercel builds `app/` (root
   directory `app`, framework auto-detected) and deploys `app/api/*.js`
   as serverless functions alongside; GitHub Pages does a parallel
   static-only build of the same commit.

## 3. Visual design system

Two references, fused rather than alternated: **Warframe's Prime
aesthetic** (gold-on-white/ivory, orbiter-console geometry, clean vector
precision, glowing accent lines) and **Hades / Hades II** (Greek myth,
painterly linework, laurel and meander ornament, warm marble and
oxidized-bronze surfaces). The fusion point is *Greek gold-work* — think
a temple relief rendered with sci-fi precision, not two clashing skins.

### Palette (CSS custom properties, defined once in `app/src/index.css`)

| Token | Value | Use |
|---|---|---|
| `--ink` | `#0b0a08` | Page background, deepest surfaces (obsidian, not pure black) |
| `--ink-raised` | `#14120e` | Card/panel background |
| `--ink-line` | `#2a2620` | Hairline borders on dark surfaces |
| `--marble` | `#f3ecda` | Primary text on dark, light-surface background |
| `--marble-dim` | `#c9c0a8` | Secondary/muted text |
| `--gold` | `#caa24b` | Primary accent — borders, active states, icons |
| `--gold-bright` | `#e8c876` | Hover/focus, glow highlights |
| `--gold-deep` | `#8a6a24` | Pressed states, recessed engraving shadows |
| `--bronze` | `#7d6a4a` | Secondary ornament (verdigris-adjacent, desaturated) |
| `--oxblood` | `#7a2222` | Danger, HP loss, DM-only "danger zone" actions |
| `--laurel` | `#4a5c3a` | Success, healing, player-safe confirmations |

Dark-first: the app defaults to the obsidian/gold combination (works at a
table at night, doesn't blow out a phone screen). A light "marble" theme
(ivory background, ink text, same gold accents) is a plausible v2 toggle
but not required for launch.

### Typography

- **Display / headers**: `Cinzel` (Google Fonts) — carved-stone capitals,
  reads as both "Greek temple" and "sci-fi codex title card."
- **Body**: `Marcellus` or `EB Garamond` — a warm serif, legible at small
  sizes for long notes/stat blocks.
- **Numerals / stat blocks**: a monospace (`ui-monospace` stack) for
  anything tabular — ability scores, HP, initiative order — so columns
  align.

Load via `fonts.googleapis.com` / `fonts.gstatic.com` exactly like
bonfire's CSP already allowlists (see `app/vercel.json`).

### Ornament vocabulary

Reusable pieces, not one-off decoration — build them as small components
once `app/src/components/ornament/` exists:

- **Greek key (meander) border** — an SVG/CSS repeating pattern used as a
  1–2px rule under headers and around card frames. Gold on dark.
- **Laurel flourish** — flanking a title or a "victory"/level-up state.
- **Angular corner brackets** (Warframe UI signature) — on focused/active
  panels, like a targeting reticle; pairs surprisingly well with laurel
  since both are corner/edge ornament rather than fill.
- **Radial glow** behind primary icons/avatars — soft gold bloom, low
  opacity, on `--ink` backgrounds only (never under body text).
- **Engraved panel**: a card with a 1px `--gold-deep` inset shadow (looks
  carved in) plus a `--gold` 1px outer edge (looks gilded) — the base
  "surface" component every panel/card in the app should share.

Motion should be restrained and mechanical-yet-ceremonial: panels
slide/fade in like console UI (Warframe), confirmations get a brief gold
flourish-draw (Hades' seal-of-approval feel) rather than bouncy easing.

## 4. Identity & roles

Two independent axes — **how you're signed in** and **what hat you're
wearing right now** — not one combined enum, because the same person is a
DM for one campaign and a player in another.

### Guest vs account

- **Guest**: no signup. Picks a display name and a starting role, gets a
  session that lives entirely in `localStorage`/IndexedDB on that device.
  Nothing is synced or shared. This is the "no backend configured" code
  path from §2, always available even when Supabase *is* configured — it
  is a permanent product feature (jump in at the table with zero
  friction), not just a pre-setup fallback like it is in bonfire.
  Guest data can later be claimed by an account (v2: "sign up and keep
  this character" migration) — worth designing for, not required at
  launch.
- **Account**: Supabase Auth (email/password to start; magic link is a
  cheap follow-on). Profile row keyed to `auth.users.id`. Enables
  cross-device sync and being invited into other people's campaigns.

### DM vs Player

Membership-scoped, not account-scoped: a `campaign_members.role` of `dm`
or `player` per campaign (schema in §7). The home screen's "Player or DM"
choice is really "what do you want to do right now" —
create/run a campaign (DM) vs join one (Player) — and for guests, who
have no campaign row yet, it's a pure UI-mode toggle held in the local
session.

## 5. Security posture

Same doctrine as bonfire, extended for real user data:

- The browser only ever holds the Supabase **anon** key. Anything that
  needs elevated trust (service-role key, or just "validate this
  server-side before it touches the DB") is a function under `app/api/`.
- **Row Level Security everywhere.** Default posture per table: a user
  can read/write their own rows, and can read (never write) rows in
  campaigns they belong to, scoped via `campaign_members`. No table gets
  a blanket public-write policy.
- Campaign content (bestiary entries, notes, encyclopedia pages) is
  private to that campaign's members by default. A later "publish this
  bestiary entry publicly" flag is plausible but opt-in, never default.
- `app/vercel.json` carries the same hardening headers bonfire ships
  (CSP, HSTS, `X-Frame-Options: DENY`, locked `Permissions-Policy`) —
  extend the CSP's `connect-src` for Supabase's auth endpoints as auth
  code lands.
- Auth session tokens: rely on `@supabase/supabase-js`'s own storage
  handling (localStorage-backed, short-lived access token + refresh) —
  don't hand-rolled cookie/token logic.

## 6. Offline & export

Two distinct things, don't conflate them:

- **Offline usability (PWA)**: the app shell installs and the UI loads
  without network. Guest mode fully works offline by construction (it's
  local-only anyway). Account mode should degrade gracefully — show
  last-fetched data with a "you're offline" indicator — rather than
  hard-failing; full offline read/write sync (a queue that replays on
  reconnect) is a stretch goal, not launch-blocking.
- **"Keep it offline" export**: any world-building content (bestiary
  entries, encyclopedia pages, notes, a campaign's character sheets)
  needs a **plain-text/Markdown export** a DM can save to disk and read
  with zero app — this was explicitly requested and is a first-class
  feature, not an afterthought. Practically: a `toMarkdown()` serializer
  per content type, a "Export campaign" action that zips them (or
  concatenates into one `.md` per category), downloaded client-side (no
  server round-trip needed, it's just formatting data the client already
  has).

## 7. Data model (roadmap)

Core (build first, needed for the home screen / auth flow to mean
anything):

- `profiles` — one row per `auth.users`, display name, avatar, etc.
- `campaigns` — id, name, description, `dm_id`, invite code, timestamps.
- `campaign_members` — `campaign_id`, `user_id`, `role` (`dm`|`player`),
  joined_at. Composite PK `(campaign_id, user_id)`.

Phase 2+ (each gets its own schema migration + RLS pass when its feature
is built — don't pre-create empty tables for these, design them when
their screen is actually being built so the schema fits real UI needs):

- **Character sheets** — per-player, per-campaign; needs to support
  whatever ruleset the table plays (start with 5e-shaped fields, but
  don't hardcode assumptions that block homebrew).
- **Bestiary** — DM-authored monster entries, campaign-scoped, with a
  stat-block shape close to character sheets' combat fields (so battle
  tracking can read both uniformly).
- **Encyclopedia** — DM-authored lore/world entries (locations, factions,
  items, NPCs), full-text searchable (Postgres `tsvector` + a search
  index; this is the "search feature" called out in the request).
- **Notes** — freeform, owned by either a DM (campaign-visible or
  DM-private) or a player (private by default, shareable to DM).
- **Battle tracker** — initiative order, HP/condition tracking per
  combatant, referencing character sheet and bestiary rows for their
  base stats; live within a session (likely wants realtime sync between
  the DM's screen and players' screens — Supabase Realtime is the
  natural fit when this is built).
- Later, DM-quality-of-life ideas worth keeping in mind but not
  scheduled: random encounter/loot tables, a session-log/recap feed,
  dice roller with shared roll history.

## 8. Feature roadmap (phases)

1. **Foundation** (this session): Bible, theme system, home screen
   (guest/login + DM/Player), auth/session plumbing, core schema.
2. **DM world-building**: encyclopedia + bestiary, with search and
   Markdown export.
3. **Player tools**: character sheet, personal notes.
4. **Live play**: battle tracker, initiative, condition tracking —
   likely the first feature needing Supabase Realtime.
5. **Polish**: offline sync queue, guest→account migration, light theme,
   campaign invite flows, session recap/log.

## 9. Conventions

- Keep `app/` self-contained (its own `package.json`, own lint config) —
  same shape as bonfire, in case this repo ever needs a second app
  alongside it.
- Every new table gets RLS turned on in the same migration that creates
  it — never a follow-up "add security later" step.
- Prefer small, composable UI components in
  `app/src/components/` over screen-specific one-offs, especially for the
  ornament vocabulary in §3 — it's meant to be reused across every
  screen, not just the home screen.
- When a feature needs a design decision not covered here, make the
  call, ship it, and **update this file** in the same commit so it stays
  the source of truth.
