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

### Palette & theming (CSS custom properties, defined once in `app/src/index.css`)

Tokens are semantic, not literal, because both themes below redefine
them: `--surface`, `--surface-raised`, `--surface-glow`, `--line`,
`--text`, `--text-dim`, plus the accent set `--gold`, `--gold-bright`,
`--gold-deep`, `--bronze`, `--oxblood`, `--laurel`. Screens/components
should only ever reference the semantic name, never a literal hex.

Dark (default) is the obsidian/gold combination described above. Light
("ivory") swaps `--surface`/`--surface-raised` for warm off-white
(`#f4ecd8` / `#fffcf3`), `--text` for a deep warm brown-black, and darkens
the gold accents (e.g. `--gold` → `#a9812f`) so they still read against a
light ground instead of washing out. Both are fully implemented, not just
dark with a stub: see `lib/theme.js` + `components/ThemeToggle.jsx` (a
fixed button, present on every screen) — same technique as a themed
Artifact: bare `:root` holds the dark tokens, a
`prefers-color-scheme: light` media query provides the un-set default,
and an explicit `[data-theme]` attribute (set by the toggle, persisted to
`localStorage`) wins in either direction.

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

Reusable pieces, not one-off decoration — live in
`app/src/components/ornament/`. The line quality is deliberately
lopsided: almost everything is free-flowing (Hades), with one small,
intentional dose of angular "tech" (Warframe) as a counterpoint rather
than an even split:

- **Flowing vine divider** (`FlowingDivider.jsx`) — the *primary* rule
  under headers: a single smooth bezier S-curve with a few hand-placed
  leaf shapes and a small center reticle-dot (the one Warframe touch
  woven into an otherwise organic line). Replaced an earlier, stiffer
  Greek-key rule in this role.
- **Laurel flourish** (`Laurel.jsx`) — flanks a title. Leaves are bezier
  teardrops planted along a curved stem via its tangent angle (not fixed
  ellipses at fixed angles), with a couple of berries near the base —
  reads as a hand-drawn branch, not a repeating stamp.
- **Panel crest** (`PanelCrest.jsx`) — the ornament across the top of a
  primary panel (`Panel`'s `topRule` prop): end studs, tapering rules, a
  pair of laurel sprigs, and a faceted gem at center. Replaced an
  earlier flat Greek-key (meander) strip in this role — same "small,
  sparing accent" job, just reads as a heraldic crest instead of a
  repeating pattern. `GreekKeyRule.jsx` still exists and is available
  for a genuinely angular accent elsewhere, but nothing currently uses
  it.
- **Angular corner brackets** (`.corner-frame` on `Panel`) — the other
  deliberately blocky element, a Warframe targeting-reticle on the
  screen's primary panel. Kept blocky on purpose, as the counterpoint the
  free-flowing ornament plays against — don't soften these to match.
- **Radial glow** behind primary icons/avatars — soft gold bloom, low
  opacity, on `--surface`/`--surface-raised` only (never under body text).
- **Engraved panel** (`Panel.jsx`): a card with a 1px `--gold-deep` inset
  shadow (looks carved in) plus a `--gold` 1px outer edge (looks gilded)
  — the base surface every panel/card in the app shares.
- **Grain**: a very faint SVG-turbulence texture over the whole page
  (`body::before`, ~3% opacity, overlay blend) standing in for
  parchment/marble — subtle enough to never compete with content.

Motion should be restrained and mechanical-yet-ceremonial: screens fade/
lift in on mount (`.screen-enter`), confirmations should eventually get a
brief gold flourish-draw (Hades' seal-of-approval feel) rather than
bouncy easing — not yet implemented beyond the entrance fade.

**A `.screen-enter` gotcha, worth knowing before touching it again:** its
keyframes must end at `transform: none` (the literal keyword), and the
animation shorthand must NOT carry `both`/`forwards`. A browser resolves
an animated `transform` to a matrix — even the identity matrix — for as
long as a fill mode keeps the end keyframe applied, and any non-`none`
transform (identity included) makes that element a containing block for
`position: fixed` descendants. With `both` set, a `.screen-enter` screen
containing a fixed element (the bottom tab dock, the `ThemeToggle`
button if it were ever nested inside one) would silently anchor that
fixed element to the screen's own box instead of the real viewport once
its content grew taller than one screen. Dropping the fill mode fixes it
because the element's `transform` then genuinely reverts to `none` the
instant the 420ms animation ends — same visual result, no side effect.

### Navigation

Inside a campaign, section navigation (Encyclopedia/Notes/Bestiary/
Characters) is a fixed bottom tab dock (`BottomTabDock.jsx`, mobile-app
style) rather than top text tabs — see `CampaignScreen.jsx`. A left/right
touch swipe on the content area moves between the same tabs (past a 60px,
clearly-horizontal threshold, so a scroll or a button tap-drag can't
misfire); the dock and the swipe are two entry points into one
navigation, not two separate systems. Icons live in
`components/ornament/TabIcons.jsx`, same free-flowing stroke style as
the rest of the ornament vocabulary.

Every fixed-position UI element (`.tab-dock`, `.dice-fab`, `.dice-panel`,
`.theme-toggle`) carries a `transform: translateZ(0)` + `-webkit-
backface-visibility: hidden` pair — a GPU-layer-promotion hint, not a
visual effect. It mitigates a known iOS Safari bug where `position:
fixed` elements can visibly detach and scroll with the page during the
address-bar show/hide animation. Carry this forward on any new
fixed-position element rather than dropping it as dead-looking CSS.

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
- **Account**: Supabase Auth, but **username/password**, not email —
  nobody at the table wants to give an email address to sign up. Supabase
  Auth has no native username identity type, so `lib/session.js`
  deterministically maps a username to a synthetic address under a
  reserved (RFC 2606) `.invalid` TLD (`stormcaller` →
  `stormcaller@accounts.codex.invalid`) — guaranteed never a real,
  deliverable domain — and everything downstream (RLS, `auth.uid()`,
  `profiles`) works exactly as it would with a real email, because as
  far as Postgres is concerned it's just an email column. The username
  *is* the display name (one field to fill in, not two). The tradeoff
  this accepts, same shape as the anonymous path below: no email means
  no password-reset-by-email — losing the password loses the account.
  **Requires "Confirm email" turned OFF** under the Supabase project's
  Authentication → Providers → Email settings — a dashboard toggle, not
  something a migration can set — because a confirmation email sent to a
  `.invalid` address can never be delivered or clicked, which would
  otherwise permanently lock every new signup out.
- **Anonymous account** (a third thing, not a variant of the other two):
  `supabase.auth.signInAnonymously()` behind the `/join` screen — "join a
  real campaign as a player, no signup." It's a genuine Supabase Auth
  session with a real `auth.uid()`, so every RLS policy applies exactly
  as it does for a full account (membership, notes authorship, later a
  character sheet's `player_id`) — it is emphatically not the same thing
  as Guest above, which never touches the network at all. The tradeoff
  it accepts: the session lives only in that browser, tied to Supabase's
  own anonymous-session persistence — no email recovery if it's lost.
  Needs **Anonymous sign-ins** turned on in the Supabase project's Auth
  settings (a dashboard toggle, not something a migration can set) —
  see `db/migrations/003_anonymous_players.sql`.

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

## 7. Data model

Each table lives in its own file under `db/migrations/`, run in filename
order — see that directory's own comments for the exact columns/RLS.
Nothing here is pre-created ahead of its screen; each was added in the
same session its feature was built.

Built (`001_core.sql`):

- `profiles` — one row per `auth.users`, display name, created by a
  trigger on signup.
- `campaigns` — id, name, description, `dm_id`, invite code, timestamps.
- `campaign_members` — `campaign_id`, `user_id`, `role` (`dm`|`player`).
  Composite PK. A campaign always has exactly one row per participant,
  the DM included (auto-created by a trigger on campaign insert) —
  there's no special-cased "owner who isn't a member" path.
- `join_campaign_with_code(code)` — the guarded RPC a player calls to
  redeem an invite code and become a member; `is_campaign_member(...)` —
  the RLS helper every later table's policies build on.

Built (`002_world_building.sql`):

- `encyclopedia_entries` — DM-authored, campaign-scoped: `category`
  (location/npc/faction/item/lore/other), `title`, `body`, `tags text[]`,
  plus a generated `search_vector`/GIN index for when client-side
  filtering (what the UI actually does today — see below) stops scaling.
- `bestiary_entries` — DM-authored stat blocks: AC/HP/hit dice/speed,
  an `abilities jsonb` blob (`{str,dex,con,int,wis,cha}` — jsonb rather
  than six columns so homebrew can stash extra keys later), challenge
  rating, traits/actions/notes text, same search_vector treatment.
- `notes` — freeform, owned by whoever wrote them. `visibility` is
  `private` (author only, default), `dm` (author + that campaign's DM),
  or `campaign` (every member); only the author can ever edit/delete.
  `author_id`/`created_by` columns across all three are stamped by a
  `BEFORE INSERT` trigger from `auth.uid()`, never trusted from the
  client — same doctrine as `little-bonfire`'s `reset_server_columns`.

All three are read through `lib/contentStore.js`, which gives guest
mode (a JSON array in `localStorage`, keyed per campaign+kind) and
account mode (the Supabase tables above) the same camelCase,
Promise-returning shape — screens (`EncyclopediaScreen.jsx`,
`BestiaryScreen.jsx`, `NotesScreen.jsx`) don't know which one they're
talking to. Search today is a client-side substring filter over the
already-loaded list (`matchesQuery` in `lib/encyclopedia.js`) — adequate
at the scale of one table's homebrew content; the `search_vector`
columns exist for when that stops being true, not because they're wired
up yet. Every content type has a `toMarkdown()` serializer
(`lib/{encyclopedia,bestiary,notes}.js`) and an Export button
(`lib/markdownExport.js`'s `downloadTextFile`) — the "keep it offline"
feature from §6, working today per-entry and per-list.

Built (`004_character_sheets.sql`):

- `character_sheets` — one per player per campaign. The DM "hands one
  out" by inserting it assigned to a `player_id` (insert is DM-only by
  RLS); after that, the DM *or* the owning player can edit the
  mechanical fields (class/level, race, background, `abilities` jsonb —
  same shape as `bestiary_entries`, AC/HP/speed, equipment, features).
- `character_conditions` — debilitations/boons layered onto a sheet,
  split into its own table on purpose: Postgres RLS is row-level, not
  column-level, so "the player can edit their own sheet but never touch
  its conditions" needs a separate table rather than one more column.
  Only the DM has any insert/update/delete policy here at all — that
  table-level split *is* the mechanism behind "the DM can secretly
  debilitate a player," not a UI-level restriction that a crafted
  request could bypass. `visible_to_party` (default true) additionally
  lets a DM keep a condition hidden from the rest of the table while the
  affected player still always sees their own — a secret curse only
  that player and the DM know about, say. `is_campaign_dm(...)` was
  added alongside these as the DM-check equivalent of
  `is_campaign_member(...)`.
- Guest mode has no real membership list, so a guest-created sheet is
  always assigned to a fixed `LOCAL_PLAYER_ID` constant rather than a
  real `auth.uid()` — see `lib/characters.js`. Guest mode also relaxes
  "DM hands it out" to "DM *or* the guest, either role, can create one,"
  since a solo local sandbox has no second person to hand anything to;
  conditions stay DM-only even in guest mode, since demonstrating that
  restriction is the point of the feature.

Built, but not a `db/migrations/` table — no backend at all:

- **Dice roller** (`components/DiceRoller.jsx`) — a floating button
  rendered once at the App root (`App.jsx`, sibling to the router), so
  it's reachable from every screen including the very first one, before
  a visitor has picked Guest/Join/Log In. Presets (d4 through d100)
  build a pool rather than rolling instantly: tapping a die adds one to
  Count if it's already the selected die (three taps on d6 → 3d6),
  otherwise it switches the selection and resets Count to 1. The
  Count/d/Sides/+Modifier row underneath is a plain "any die size"
  builder (not capped to the presets), reading like the dice-notation
  shorthand it produces; the Modifier field starts blank with a `+5`
  placeholder rather than defaulting to a literal `0`. Rolls use
  `crypto.getRandomValues` rather than `Math.random()`. Per-visitor roll
  history only (component state, resets on reload) — it is deliberately
  **not** synced across the table; that's the one piece of the original
  "dice roller with shared roll history" idea still open, and it's
  really the battle tracker's realtime problem (below) more than the
  roller's.
  Each roll renders as actual dice (`Die.jsx`), not just a number list —
  and each die's outline is its real shape, confirmed rather than
  guessed: d6 gets a real pip face (standard 1-6 layouts); d4 and d20
  are triangles (a tetrahedron's and an icosahedron's actual faces),
  widened for d20 into a hexagon so "many-sided, almost round" doesn't
  read as the same shape as d4's sharp point; d12 is a pentagon
  (dodecahedron face); d10 is a kite (a pentagonal trapezohedron's face
  really is a kite quadrilateral, not a pentagon); d8 is drawn as the
  bipyramid's diamond silhouette (two square pyramids base-to-base)
  rather than one triangular face, since a bare triangle there would be
  indistinguishable from d4/d20 at this size. Anything else (a custom
  d7, d47, …) falls back to a plain circle — there's no real polyhedron
  to reference, so it doesn't pretend to be one. Each die tumbles in
  staggered by index
  (`animationDelay`, capped so a big pool doesn't take forever to
  settle), and the total pops in slightly after the last die lands. A
  pool over `MAX_VISIBLE_DICE` (24) shows the first 24 plus a "+N more"
  chip — the total is always the real sum over every die rolled,
  whether or not it's drawn.

Not built yet — each still gets its own migration + RLS pass when its
screen is built, per the rule above:

- **Battle tracker** — initiative order, HP/condition tracking per
  combatant, referencing character sheet and bestiary rows for their
  base stats; live within a session (likely wants realtime sync between
  the DM's screen and players' screens — Supabase Realtime is the
  natural fit when this is built). A shared/synced roll log (everyone at
  the table sees everyone's rolls) is a natural extension once that
  realtime plumbing exists.
- **Tagging** — requested, not yet scoped. `encyclopedia_entries.tags`
  already exists per-entry, but there's no cross-content tagging/
  filtering (e.g. one tag spanning encyclopedia + bestiary + notes +
  character sheets, or a way to browse "everything tagged act-one").
  Needs a scoping pass before building — decide whether it's a shared
  tag vocabulary per campaign or freeform per entry, and whether it's
  browse/filter only or also drives cross-linking between entries.
- Later, DM-quality-of-life ideas worth keeping in mind but not
  scheduled: random encounter/loot tables, a session-log/recap feed.

## 8. Feature roadmap (phases)

1. **Foundation** — done. Bible, theme system, home screen (guest/login
   + DM/Player), auth/session plumbing, core schema.
2. **DM world-building** — done. Campaign hub (create/join/list),
   encyclopedia + bestiary + notes, all with Markdown export. Light/dark
   theme toggle and the free-flowing ornament pass also landed here.
3. **Player tools** — done. Character sheets (DM hands out, player edits
   their own, DM-only conditions/debilitations — §4/§7), personal notes
   (shipped in phase 2, notes aren't DM-only), and a no-account "join a
   campaign as a player" path via anonymous sign-in (§4). Bottom
   swipeable tab nav and the global dice roller also landed here.
4. **Live play**: battle tracker, initiative, condition tracking —
   likely the first feature needing Supabase Realtime; a shared roll log
   for the dice roller is a natural rider on that same plumbing.
5. **Polish**: offline sync queue, guest→account migration, campaign
   invite-flow UI beyond the raw code field, session recap/log, tagging
   (see §7 — needs scoping first).

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
- **Deleting a card is always a corner badge, never an inline "Delete"
  button.** Use `<DeleteButton onConfirm={...} label="..." />`
  (`app/src/components/DeleteButton.jsx`) as the first child of the
  `<Panel>`, not in the Export/Edit action row. It renders as a small `×`
  perched half-outside the card's top-right corner (`.corner-delete` in
  `index.css`, `top: -10px; right: -10px;` so it never collides with an
  in-card header chip like category/CR/role). One tap arms it — it turns
  oxblood and pulses, tooltip flips to "tap again to confirm" — a second
  tap within 2.5s actually deletes; losing focus or letting the window
  lapse quietly disarms it. No modal, no separate confirm screen. Applied
  to Encyclopedia entries, Bestiary creatures, Notes, and character
  sheets. This does *not* replace small inline-chip actions that aren't a
  full-card delete — e.g. the per-condition `×` on a character sheet's
  condition chips stays as a plain inline button, since removing one
  condition isn't destructive enough to warrant a confirm step and doing
  so would visually clash with the corner badge on the same card.
- **Every non-root screen gets a `<BackButton to="..." label="..." />`**
  (`app/src/components/BackButton.jsx`) as the first thing rendered,
  above the heading — never a plain "Back" button buried below the
  primary action. It's the one standing back-navigation affordance;
  don't hand-roll another "← X" button. The navigation map:
  - `/guest`, `/login`, `/join` → back to `/` (Home). Home already
    redirects an authenticated/guest session straight to `/dashboard`,
    so this is safe even mid-session.
  - `/campaigns/:id` (and everything nested under it — Encyclopedia,
    Notes, Bestiary, Characters, reached via the bottom tab dock, not
    stack navigation) → back to `/dashboard`, labeled "Campaigns". One
    `BackButton` above the swipeable tab content covers all four tabs.
  - `/dashboard` has no back arrow — it's the authenticated root. Its
    existing "Log Out" / "Leave Table" button is the deliberate exit
    action instead (a plain back to `/` while still signed in would just
    bounce off Home's redirect and land back on `/dashboard`, which is a
    confusing no-op UI).
  - `/` (Home) is the true root — nothing above it.
