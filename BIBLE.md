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

- One app, two hats: **Dungeon Master** tools (world-building via the
  Encyclopedia, the Bestiary, encounter/battle tracking, campaign notes)
  and **Player** tools (character sheet, personal notes) — a player's
  whole surface is those two, full stop; the Encyclopedia and Bestiary
  tabs don't exist for them at all, not just locked read-only (§4/§9).
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

### The Character Sheet — the deliberate exception

Every other screen is cards in a list, built from the shared `Panel`/
`.chip`/`.field` vocabulary above. `CharacterSheetScreen.jsx` (route
`/campaigns/:campaignId/characters/:sheetId`) is the one screen meant to
look and feel different — a player's own character is the thing they're
meant to linger on through a whole session, not skim past like an
encyclopedia entry. It's still built from the same tokens
(`--gold`/`--oxblood`/`--laurel`, `Cinzel`/`Marcellus`), just at a
different scale and with its own centerpiece shape:

- **A whole screen, not a tab.** It's a sibling top-level route of
  `/campaigns/:campaignId`, *not* nested under `CampaignScreen`'s
  `Outlet` — no bottom tab dock, no DM/Player chip, no "← Campaigns"
  chrome. It resolves its own campaign/role via `useCampaignAccess()`
  (`lib/useCampaignAccess.js`, the same guest/account branch
  `CampaignScreen` does, factored out so this screen can opt out of the
  shared chrome without duplicating that logic badly) rather than
  reading the Outlet context. Its own `BackButton` goes to the roster
  (`CharactersScreen.jsx`, which now only lists cards and picks — actually
  opening one is this screen's job).
- **The hex stat plate** (`.stat-hex` / `.stat-hex-inner` in
  `index.css`) is this screen's one new shape, deliberately not reused
  elsewhere — two nested `clip-path` hexagons (gold outer, surface-
  colored inner, 2px gap faking a beveled border clip-path can't draw on
  its own) for AC/Initiative/Speed and the six ability scores. Modern
  (D&D Beyond-style hex ability scores) crossed with the classic paper
  sheet's layout, not a literal reproduction of either.
- **A live HP tracker**, not a static number — a gradient bar
  (`.hp-track`) that recolors as it depletes (gold → bronze → oxblood at
  the 50%/25% thresholds) plus a delta input + Damage/Heal buttons that
  patch `currentHp` immediately. This is the thing that makes the screen
  worth returning to mid-combat, not just once at character creation.
- **Its own background treatment** — two soft radial gradients (a gold
  bloom behind the header, an oxblood one low behind the footer) over the
  normal `--surface`, distinct from every other screen's flat
  radial-from-`--surface-glow` body background.
- **Edit-in-place, not a separate route.** Tapping "Edit Sheet" swaps the
  plate's read view for an ordinary `.field`-based form in the same spot
  — no navigation, no modal. `canEdit()` mirrors CharactersScreen's own
  DM-or-owning-player check (§4).

If a future screen wants its own distinct treatment too, that's fine —
just don't reach for the hex plate or this exact background gradient for
it. This vocabulary is reserved for the character sheet specifically, the
same way `.corner-frame`'s angularity is reserved for "primary panel,"
not sprinkled everywhere.

### UI/UX + design pass (2026-09) — floating chrome vs. real content

A full click-through of every screen (both themes, a 390×844 viewport,
verified with Playwright rather than eyeballing screenshots alone)
surfaced two bugs specifically about the app's *global floating chrome*
— the dice-fab and `.tab-dock` (both `position:fixed`, rendered above
everything) — fighting with the real content underneath them:

- **The dice roller had no way to dismiss itself except re-tapping the
  FAB.** No backdrop, no click-outside, no Escape. `.dice-panel` can run
  ~350px tall and, depending on the screen, can fully cover primary
  content underneath it (confirmed live: on the Home screen it
  completely occludes "Continue as Guest," making it unclickable while
  open). `DiceRoller.jsx` now closes on an outside `pointerdown` or
  Escape — a `panelRef`/`fabRef` pair excluded from the "outside" check
  so tapping the FAB itself still just toggles normally.
- **Short tab content could end up permanently stuck behind the
  dice-fab, unreachable by any amount of scrolling.** The fab
  (`bottom:5.5rem` + 52px tall) needs ~140px of clearance from the
  viewport bottom — more than `.tab-dock` needs, since it sits higher up
  specifically so the two never collide with *each other* (see the
  dice-fab's own CSS comment) — but the screens rendering underneath
  both were only padded for the dock. Confirmed live on Bestiary's empty
  state (a brand new campaign's first real view of that tab): 2 example
  cards was enough to push "No creatures yet" a few px into the fab's
  footprint, and the page's total scrollable range fell ~30px short of
  ever letting it scroll clear. `CampaignScreen.jsx`, `CampaignHubScreen.jsx`,
  and `.character-sheet-screen` (`index.css`) all now carry `10rem`
  bottom padding — comfortably past the fab's ~140px requirement — so
  scrolling to the end of any tab always fully clears it. (The very
  first, unscrolled paint can still show a few px of overlap in the
  rare short-content case — padding after an element can't retroactively
  move that element up — but the content is never unreachable anymore,
  which is the part that was actually broken.)

A third, unrelated finding from the same pass: **`.btn-primary`'s text
color was `var(--surface)`**, which is near-black in dark mode (reads
fine) but a pale cream in light mode — measured ~3:1 contrast against
the gold gradient background, under WCAG AA's 4.5:1 for normal text.
Every primary button in the app (the single most prominent action on
nearly every screen) was affected. Fixed with a new token,
`--on-gold` — a fixed near-black kept the *same* in both themes rather
than swapping per-theme, since near-black already worked fine against
gold in dark mode and measures ~5.9:1 in light mode too (comfortably
clears AA). The d6 pip die face (`Die.jsx`) had the exact same
`var(--surface)`-on-gold pattern for its pip dots and got the same fix;
its oxblood/fumble-state pip color was left alone; that's a separate,
less clear-cut contrast question this pass didn't set out to answer.

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
- **Account**: Supabase Auth with a **real email address** and a
  separate **display name** — two fields, not one. `AuthScreen.jsx`
  collects both on signup: the email is the login identifier (what
  Supabase Auth actually keys on) and never shown to other players; the
  display name is what the table sees, stored on `profiles` via the
  `handle_new_user()` trigger (`db/migrations/001_core.sql`) exactly like
  before. `signUp()`/`signIn()` (`lib/session.js`) pass the email straight
  through to Supabase — no transformation, no synthetic domain.

  **This wasn't the original design.** The first version mapped a
  *username* to a synthetic, undeliverable email under a made-up domain
  specifically so nobody had to give a real address to sign up — and it
  had to be abandoned. Live testing (2026-09) found Supabase Auth's
  server-side validator rejects a signup outright — `Email address "x"
  is invalid` (400) — whenever the domain doesn't have real, resolving
  DNS. Swapping the reserved `.invalid` TLD for an ordinary-looking
  `.com` one *also* failed identically, which ruled out "the TLD looks
  fake" as the cause: two different invented domains, rejected the same
  way, means no invented domain was ever going to work without actually
  owning real DNS for it — not a naming problem a better guess could fix.
  Real email is the one signup identifier Supabase Auth is actually built
  around, so that's what this uses now.

  This isn't a pure downgrade, either: a synthetic address could never
  receive a password-reset link, so losing a password used to mean
  losing the account outright with zero way back in — the single
  biggest risk flagged about the old design. A real email fixes that for
  real (see "Forgot password?" below), which is worth the small extra
  step of asking for one at signup.

  **Confirm Email works properly now, either way you leave it.** Under
  the Supabase project's Authentication → Providers → Email settings:
  leave it **on** (the default) for the standard "click the link we
  emailed you" flow — `signUp()` passes `emailRedirectTo` pointing back
  at the app's own root, so clicking it lands the visitor back here
  already signed in — or turn it **off** if immediate sign-in without a
  confirmation step is preferred. Neither choice needs a workaround
  anymore; `friendlyAuthError()`'s `"Email not confirmed"` message
  (`lib/session.js`) reads as an ordinary "check your inbox" instruction
  now instead of a report of the app being stuck.

  **Forgot password?** `requestPasswordReset()` (`lib/session.js`) calls
  `supabase.auth.resetPasswordForEmail()` with `redirectTo` pointing at
  `/reset-password` (`ResetPasswordScreen.jsx`, a new top-level route in
  `App.jsx` — not behind `RequireSession`, since it manages its own
  status-based rendering: "checking your link" while `SessionContext`'s
  `status` is still `'loading'`, "this link is invalid or expired" if it
  resolves to `'signed-out'`/`'guest'` — no recovery session was ever
  established — and the actual "set a new password" form once it's
  `'authenticated'`). Clicking the emailed link is itself what
  authenticates the visitor here — supabase-js detects the link's token
  in the URL and exchanges it for a real session automatically, which
  `SessionContext`'s existing `onAuthStateChange` listener picks up
  exactly like a normal login. The request step always shows the same
  "if that email has an account, we've sent a link" message regardless
  of whether it actually does — Supabase's own API doesn't distinguish
  either, deliberately, so this can't be used to probe which addresses
  are registered.

  **Email links, end to end** (added after scoping what signup still
  needed): a link can fail (expired, already used) or land somewhere
  unexpected, and the Supabase client handles neither visibly on its
  own. `authRedirect` in `lib/supabase.js` reads the URL *before*
  `createClient()` runs (the client clears it asynchronously once it
  starts): a failed link's `error_code`/`error_description` becomes a
  plain message shown on Home or `/reset-password` (dismissable, and
  stripped from the URL so a reload doesn't repeat it), and a
  `type=recovery` hash marks a password-reset link. `RecoveryRedirect` in
  `App.jsx` sends a reset link to `/reset-password` wherever it landed —
  carrying the hash along so the client can still exchange its token —
  because if the deployed URL isn't in Supabase's Redirect URLs
  allow-list the link lands on the Site URL root, and Home would
  otherwise just send the now-signed-in visitor to the dashboard without
  ever asking for a new password. The client's `PASSWORD_RECOVERY` event
  triggers the same redirect as a second signal. An unconfirmed login,
  or a signup that came back without a session, offers **Resend
  confirmation email** (`resendConfirmation()`), cooled down 60 seconds
  to match Supabase's own per-address limit.

  **Supabase's built-in mailer only emails the project's own team** (and
  about 2 an hour) unless custom SMTP is configured — everyone else gets
  "Email address not authorized" / "Error sending confirmation email".
  `friendlyAuthError()` names that for whoever runs the backend instead
  of showing it raw; README.md's setup steps cover the dashboard side
  (URL Configuration, and custom SMTP or "Confirm email" off).

  **A signup- or reset-time typo is still worth designing against**, even
  with recovery now possible — it's still friction nobody wants to hit.
  `AuthScreen.jsx`'s signup mode keeps the required Confirm Password
  field checked against Password client-side before the form ever submits
  (`"Passwords don't match"`, no network round-trip spent finding out)
  and a shared show/hide toggle for both fields. `displayNameError()` and
  `emailError()` (`lib/session.js`) are lightweight client-side backstops
  — matching `profiles.display_name`'s own 1-60-character check
  constraint and a loose "does this look like an email" shape check
  respectively — not the real validation (Supabase's own is), just enough
  to fail with a plain message before a network round-trip instead of a
  raw error after one.

  Every Supabase Auth error passes through `friendlyAuthError()`
  (`lib/session.js`) rather than showing `error.message` verbatim, so a
  network hiccup or rate limit reads as "try again" instead of a dead
  end, "That email is already registered" points at logging in or
  resetting instead of a raw duplicate-key error, and "Signups not
  allowed" (the project's Authentication settings disabled new sign-ups
  outright) reads as something to ask whoever runs the backend about
  rather than a mysterious failure. Anything genuinely unrecognized still
  gets a usable fallback, but with the real error detail and HTTP status
  appended in parentheses rather than hidden — debugging a live signup
  failure with someone who has no dev tools access proved that a plain
  "try again in a moment" isn't enough to diagnose from; the real reason
  has to reach the screen, not just the console. `lib/supabase.js` closes
  the gap upstream of all of this: a malformed `VITE_SUPABASE_URL` (a
  stray quote character, a trailing `/rest/v1`, copy-paste whitespace)
  used to produce a client that looked configured but wasn't, surfacing
  as a raw, unexplained fetch/URL error the moment someone actually
  submitted the sign-up form. `describeUrlProblem()` / `describeKeyProblem()`
  catch the specific, wrong shape at load time (not just "something's
  wrong") and fall back to Guest-only mode (a real, working, permanent
  feature, not a placeholder) instead, surfacing `supabaseConfigError`
  directly on the Home screen — no dev tools needed — as well as logging
  it to the console for whoever can check.

  A couple of smaller hardenings carried over from the username-based
  version, still relevant to email/password either way: password fields
  cap at 72 characters (the point past which bcrypt, what Supabase
  hashes with, stops looking — so what's typed is always what actually
  matters instead of a longer paste silently having its tail ignored),
  `autoCapitalize="none"` / `autoCorrect="off"` / `spellCheck={false}` on
  the email and password fields (a mobile keyboard silently
  "correcting" what someone typed is exactly the kind of surprise this
  flow is designed to never produce), and a `useRef` guard closing a
  double-submit race a `busy` state alone can't (a fast double-tap can
  fire a second submit before React re-renders the disabled button).
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
session (`campaign.role` on the guest campaign object, `isDM` on every
screen).

**Choosing a role at the door has to fully determine what a guest sees —
never just label it.** All local guest campaigns live in one flat
`localStorage` list regardless of which role created them (`codex.guest
.campaigns`), because switching roles never deletes anything. That's
correct for storage, but `CampaignHubScreen` used to list *all* of them
unfiltered, tagged with a small role chip — so a guest who entered as
Player would still see (and could still open) a campaign this same
device made in DM mode earlier, landing them right back in DM view
despite having just chosen Player. Fixed: the dashboard now filters
`listGuestCampaigns()` down to `campaign.role === guest.role` before
rendering. Nothing is lost — switching back to DM brings the rest of the
list right back — but from inside either role, that's the *only*
campaign library that exists. Any screen that lists or otherwise surfaces
guest campaigns should filter the same way; don't reintroduce an
unfiltered list "just for this one view."

**A guest who chose Player has to get the same read/write boundary a
real player gets — no screen should grant it blanket "you're a guest,
here's DM powers" access.** Encyclopedia and Bestiary don't just
read-only gate on `isDM` — they don't exist for a player at all.
`tabsForRole()` in `CampaignScreen.jsx` drops both tabs from the bottom
dock for anyone who isn't DM, `CampaignIndexRedirect` sends a player to
`notes` instead of `encyclopedia`, and `RequireDM` guards both routes
directly (bounces to `notes`) in case a player lands on one anyway —
stale link, browser back/forward, hand-typed URL. This is a UI-visibility
promise, not a data-security boundary; RLS is what actually protects the
rows if a real account calls the API directly. CharactersScreen used to
also check `isGuest`
as an unconditional bypass on top of that — meaning a guest-player saw
"Hand Out a Sheet" and could edit any sheet, DM language and all, even
though `isDM` already correctly said they weren't one. Fixed: guest mode
still needs *some* self-service path (a solo guest-player has no DM
handing them anything), but it's scoped to "create/edit your own one
sheet" (`isGuestPlayer = isGuest && !isDM`, capped at `sheets.length ===
0`, copy swapped to "Create My Sheet"), not "do anything a DM can do."
When adding a new screen, check both roles this way before shipping it —
open it as a guest-player (`campaign.role: 'player'` in
`localStorage['codex.guest.campaigns']`) and confirm nothing DM-flavored
leaks through via an `isGuest` shortcut.

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
  A die landing on its best or worst possible face (`value === sides` /
  `value === 1`) gets a soft pulsing glow — gold for a max roll, oxblood
  for a natural 1 — via `.die-critical`/`.die-fumble` in `index.css`,
  independently per die (a maxed d6 in a damage pool glows on its own,
  not the whole pool). It's the one moment a real table visibly reacts
  to, so it's the one place this app editorializes on a roll's result
  rather than just reporting a number.

Built (`005_live_play.sql` — Phase 4, the live-play phase from §8):

- **`encounters`** — one row per fight, campaign-scoped: `name`, `round`
  (starts at 1), `current_combatant_id`, `active`. The turn marker is a
  combatant **id**, not an index into the initiative order (the original
  scoping said index): an index silently points at someone else the
  moment a combatant is added or removed mid-fight, an id keeps pointing
  at whoever's actually up. `current_combatant_id` null on an active
  encounter means "still setting up" (initiative being rolled) — the DM's
  "Begin Combat" sets it. RLS: campaign members read, `is_campaign_dm()`
  writes — starting, advancing and ending a fight is a DM action.
- **`encounter_combatants`** — one row per participant: `encounter_id`,
  `campaign_id` (denormalized for join-free RLS, same as
  `character_conditions`), `character_id` (set for a PC, null for a
  monster/NPC), `name`, `initiative`, `dex_modifier` (initiative
  tie-breaker, and what the d20 button adds), `is_pc`. A PC's HP and
  conditions are **not** stored here — `character_sheets.current_hp` and
  `character_conditions` stay the single source of truth, so a hit taken
  on the Combat tab and one applied from the sheet are the same write and
  the two screens can't disagree. `armor_class`/`max_hp`/`current_hp`/
  `conditions text[]` only matter for monsters/NPCs. Same RLS shape as
  `encounters`.
- **`character_sheets` gained** `resources jsonb` (an array of
  `{label, max, current, shortRest}` — freeform counters for spell slots,
  Ki, Rage, anything, deliberately *not* a hard-coded 5e spell-slot
  table; this app is a companion, not a rules engine, §1) and
  `death_save_successes`/`death_save_failures` (`0-3`, check-constrained).
  Covered by the sheet's existing "DM or owning player" policy.
- **`dice_rolls`** — the shared table log: `display_name` (snapshotted at
  roll time), `expression`, `rolls jsonb`, `total`, `created_by` (stamped
  server-side). Members post and read; only the DM can clear; nobody can
  edit a roll after the fact.

**Realtime** — the first tables in the app to use it. The migration adds
`encounters`, `encounter_combatants`, `character_sheets`,
`character_conditions` and `dice_rolls` to the `supabase_realtime`
publication (guarded, so re-running doesn't error). The last three are
there because a PC's HP/conditions and the roll log live in them, not on
the combatant row. `subscribeToCampaignLive()` (`lib/encounters.js`)
opens one channel per campaign and debounces every event into a single
refetch — at this scale, refetching beats hand-merging deltas. DELETE
events can't be column-filtered in Supabase Realtime, so those are
subscribed unfiltered (under RLS they carry only the primary key — a
delete elsewhere just costs a harmless refetch). The Combat tab also
refetches when a backgrounded phone tab becomes visible again, since a
suspended tab can miss events. Realtime applies each table's RLS select
policy per subscriber, so nobody receives rows they couldn't already read.

**Guest mode gets a single-device tracker** (a change from the original
scoping, which excluded it): `lib/encounters.js` uses the same
`contentStore` guest/account split as every other content type, so a
guest DM gets the full tracker in `localStorage` — it just doesn't sync,
because there's nothing to sync to. Running combat on one laptop the
table can see is a real way to play. The roll log is account-only (a
guest's roller already keeps its own history). A guest *player* sees a
note that combat runs on the DM's device.

**The screens** — `CombatScreen.jsx` (a fifth tab, `/campaigns/:id/combat`,
visible to players too, unlike Encyclopedia/Bestiary):
- DM: Start Encounter (every character sheet joins automatically), Add
  Combatant (custom, from the Bestiary with AC/HP/DEX prefilled, or a
  party member not yet in the fight; "how many" spawns numbered copies
  that each roll their own initiative), inline initiative box + d20
  button per row, Roll NPC Initiative, Begin Combat, Next Turn / Back
  (wrapping advances the round), End Encounter (two-tap confirm). HP
  damage/heal and conditions (SRD quick-picks or custom) inline on every
  row, so the DM never alt-tabs to a sheet mid-fight.
- Players: the same list live and read-only, their own character's HP
  controls, an "It's your turn!" banner. Monster HP shows as a
  descriptor ("Bloodied"), not numbers — exact figures stay with the DM,
  as at a real table. A PC at 0 HP shows Dying/Stable/Dead from their
  death saves.
- The current turn gets the screen's one gold glow; a monster at 0 HP
  dims. Table Rolls panel at the bottom (account mode).
- `CharacterSheetScreen.jsx` gained a death-save block (only at 0 HP:
  tappable pips plus "Roll Death Save" — 10+ succeeds, a natural 1 is two
  failures, a natural 20 is back up at 1 HP), a Resources section
  (diamond pips up to 10, a −/+ counter above that), and Short Rest
  (restores resources marked "recovers on a short rest") / Long Rest
  (full HP, every resource, death saves cleared — conditions deliberately
  left to the DM). Healing above 0 HP clears death saves automatically
  (`hpPatch()` in `lib/characters.js`, shared by both screens). A failed
  write now shows inline instead of replacing the whole sheet with an
  error screen, and a write against a database that hasn't run
  migration 005 yet says so instead of showing a raw column error.
- `DiceRoller.jsx` posts to `dice_rolls` whenever it's opened inside an
  account-mode campaign route (fire-and-forget — a failed log never
  blocks the roll itself), and says so in its hint text.

Deliberately left for later (§8 Phase 5): structured inventory/currency
(a real item list with weight/gold, instead of `equipment`'s freeform
text) and an assisted level-up flow (instead of hand-editing
`class_and_level`) — real gaps, but neither blocks running a session.

Not built yet — each still gets its own migration + RLS pass when its
screen is built, per the rule above:
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
4. **Live play** — done. Combat tab with a live initiative tracker
   (Supabase Realtime in account mode, single-device in guest mode),
   inline HP/conditions per combatant, death saves, class resources with
   short/long rests, and a shared table roll log. Full detail in §7. To
   use it on a deployed backend, run `db/migrations/005_live_play.sql`.
5. **Polish**: offline sync queue, guest→account migration, campaign
   invite-flow UI beyond the raw code field, session recap/log, tagging
   (see §7 — needs scoping first), structured inventory/currency (a real
   item list with weight/gold instead of `character_sheets.equipment`'s
   one freeform text field), and an assisted level-up flow (recomputing
   HP/proficiency bonus instead of hand-editing `class_and_level` text) —
   the last two explicitly scoped out of Phase 4 (§7) as real but
   non-combat-blocking gaps.

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
  oxblood and pulses, tooltip flips to "tap again to confirm" — a second,
  *deliberate* tap within 3s actually deletes; losing focus or letting
  the window lapse quietly disarms it. No modal, no separate confirm
  screen. "Deliberate" is enforced by `GUARD_MS` (450ms) in
  `DeleteButton.jsx`: a second tap landing within that window of arming
  is the tail of the same reflexive double-tap/double-click that armed
  it, not a real decision, so it's ignored (a quick shake, not a delete)
  and the confirm window keeps counting down. Don't remove this guard to
  make the button feel snappier — it's the difference between "an
  accidental double-click nukes a session's worth of notes" and not. The
  guard is visible, not just felt: a thin ring around the badge
  (`.corner-delete-guard`) sweeps away clockwise from 12 o'clock over
  GUARD_MS, driven by `requestAnimationFrame` redrawing an inline
  conic-gradient each frame (not a CSS transition on a custom property —
  animating gradient stops that way needs `@property` support this app
  doesn't want to depend on). Once it's gone, the second tap is live.
  Applied
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
  - `/guest`, `/login`, `/join`, `/reset-password` → back to `/` (Home).
    Home already redirects an authenticated/guest session straight to
    `/dashboard`, so this is safe even mid-session — including right
    after a password-reset link has landed someone on `/reset-password`
    already authenticated.
  - `/campaigns/:id` (and everything nested under it — Encyclopedia,
    Notes, Bestiary, Characters, Combat, reached via the bottom tab dock, not
    stack navigation) → back to `/dashboard`, labeled "Campaigns". One
    `BackButton` above the swipeable tab content covers every tab.
  - `/dashboard` has no back arrow — it's the authenticated root. Its
    existing "Log Out" / "Leave Table" button is the deliberate exit
    action instead (a plain back to `/` while still signed in would just
    bounce off Home's redirect and land back on `/dashboard`, which is a
    confusing no-op UI).
  - `/` (Home) is the true root — nothing above it.
- **Content-screen toolbars (Encyclopedia/Notes/Bestiary/Characters) are
  two grouped clusters, not a flat row of buttons.** A left cluster
  (search + filter, where the screen has one) and a right cluster
  (secondary actions + the primary "New X" button) sit in a
  `justify-content: space-between` row. Each cluster wraps as a unit on
  narrow screens instead of individual buttons wrapping unpredictably —
  that's what was making the row look cluttered before. Within the
  right cluster: the primary create action stays a full `.btn-primary`
  button (it's the one thing that should pull the eye); secondary,
  rarely-used actions like "Export Markdown" collapse to an icon-only
  `.btn-icon` button (`DownloadIcon` from
  `app/src/components/ornament/UtilityIcons.jsx`, with `title`/
  `aria-label` for the label that's no longer visible as text) so they
  don't compete for weight. `ExampleGallery`'s "Show Examples" toggle
  uses the `.example-toggle` class — a plain text link with a rotating
  chevron, not a bordered button — since it's a disclosure for reference
  material, not a real action.
- **`ExampleGallery` hides itself while a create/edit form is open**
  (`{canWrite && !showForm && <ExampleGallery .../>}`, same guard on all
  four content screens). Showing a template's sample content at the same
  time as the form you opened *from* that template is confusing — is the
  sample the thing you're editing? — so the gallery disappears the
  moment `showForm` flips true and comes back once it closes.
- **A CSS grid of `repeat(N, 1fr)` columns holding inputs will blow out
  its container on a narrow screen, not wrap** — this bit the ability-
  score edit grid (Bestiary/Characters/Character Sheet forms) badly
  enough to overflow the whole page horizontally. `1fr` tracks default to
  `minmax(auto, 1fr)`, and `auto` there means "at least the content's
  intrinsic minimum width" — a number input's min-content width doesn't
  shrink, so the grid (and everything containing it) grows instead.
  Fixed via a shared `.ability-edit-grid` class: `minmax(0, 1fr)` tracks
  (lets columns actually shrink) plus a `max-width: 480px` breakpoint
  dropping from 6 columns to 3 so the inputs stay legible instead of
  just not-overflowing. Reach for `minmax(0, 1fr)` by default on any grid
  whose cells hold form controls, not just plain text.
