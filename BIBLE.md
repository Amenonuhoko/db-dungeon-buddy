# Dungeon Buddy — Project Bible

This is the reference document for this project. Read it before making a
product, design, or architecture decision — it exists so every future
session (human or Claude) picks up the same intent instead of re-deriving
it. Update it whenever a decision here changes; it should always describe
the app as it actually is/should be, not just as it started.

Name: **Dungeon Buddy** (renamed from the working name "Codex" in
2026-09). The one place the old name survives on purpose is
`localStorage` keys (`codex.guest`, `codex.guest.campaigns`,
`codex.guest.content.*`, `codex.theme`) — renaming them would silently
orphan every offline player's saved campaigns, and nobody ever sees them.
New keys use a `dungeonbuddy.` prefix.

## 1. Vision

A browser-based PWA that is a full companion for running and playing a
tabletop D&D campaign — not a dice-roller add-on, but a place a DM can
build a world in and players can live in during a session.

**Repositioned 2026-09 around a visual-aid pivot.** The app splits into
two very different surfaces, not just two permission levels:

- **Player side: one screen, the Scene.** A player's entire surface is a
  DM-uploaded background image with tokens on it showing where everyone
  (and everything) currently is — a tavern, a forest, a dungeon room.
  There is no separate Party roster page and no separate list-based
  combat tracker anymore: combat *is* the scene. Tokens carry HP,
  whose-turn-it-is, and condition badges directly on them; tapping a PC's
  token opens their character sheet, tapping a monster token shows its
  health band. Players can drag their own token; only the DM adds/removes
  tokens, changes the background, or moves anyone else's. Beside the
  scene sits a read-only, DM-curated **event log** — short lines like
  "Goblin enters the area" or "Paladin casts Lay on Hands," some
  auto-generated from mechanical actions, some typed by the DM. See §7
  (Scenes) and §8 (Phase 5) for the concrete plan.
- **DM side: everything the app already did, kept intact as backstage
  tooling.** World-building via the Encyclopedia and Bestiary, campaign
  notes, the personal sketch board, character sheet authoring, invite
  codes — none of it goes away or gets simplified. It's just no longer
  part of what a player sees or navigates; it's prep and reference
  material for building the scenes and monsters that eventually get
  pushed live. The DM prepares and runs scenes on the same Scene tab
  the players see — a prep scene stays invisible to players until the
  DM shows it.
- **The companion principle (2026-09, planned — §8 Phase 6).** The app
  is the table's companion and does only that. **Minimalist in design,
  maximalist in visual aid**: as little chrome as possible, as much help
  *seeing* the scene as possible. A player's screen is the scene, full
  screen, and nothing else. Two things sit behind it:
  - **The backpack** — everything about *your* character: the full sheet
    (stats, HP, spells, death saves, resources), your own inventory, and
    the party stash.
  - **The menu** — everything about *the table*: Talk (chat and
    whispers), the log, change character, leave the campaign, back to
    your campaigns.
  Controls hide by default. A tap shows them for a few seconds, like a
  video player; while hidden the picture and tokens stand alone — no
  HP rings, turn marker or condition tags. **Moments still play and
  fade**: a hit, a heal, a condition landing, a newcomer arriving, a
  caption from the log, and "Your turn!" (with a vibration) animate over
  the clean scene for a couple of seconds, then disappear.
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

The whole look comes from the **Dungeon Buddy mascot**: a red chibi
dragon hugging a black d20 with red numerals, sitting on a brown leather
tome with brass corner caps and blue/red/cream bookmark ribbons, next to
parchment character sheets — all drawn in a thick-outlined *sticker*
style. The app should feel like that picture: friendly, chunky, tactile,
a tabletop companion rather than a fantasy-epic title screen. (This
replaced the original "Greek gold-work" direction — Warframe Prime ×
Hades — in the 2026-09 re-skin; some token names below are left over
from it.)

The rules, in one line each:

- **Dragon red is the one accent** — primary buttons, the active tab,
  whose turn it is in combat. Nothing else competes with it.
- **Leather and parchment are the surfaces** — warm browns in the dark
  theme, cream paper in the light one.
- **Brass is trim, never a fill** — the edge of the primary panel and
  the character sheet, a critical roll.
- **Dice are the mascot's d20** — black body, red numerals, everywhere
  a die is drawn (the roller, the dice button, the app icon).
- **Sticker shapes** — rounded corners, a solid 2px outline, and a small
  solid "lip" shadow underneath (`--lip`) that presses flat on `:active`,
  so buttons and cards feel like things you can push.

### Palette & theming (CSS custom properties, defined once in `app/src/index.css`)

Tokens are semantic, not literal, because both themes redefine them.
Screens/components should only ever reference the semantic name, never a
literal hex:

- Surfaces and text: `--surface`, `--surface-raised`, `--surface-glow`,
  `--line`, `--outline` (sticker outlines), `--ink` (the lip shadow),
  `--text`, `--text-dim`.
- Accent: `--accent`, `--accent-bright`, `--accent-fill` (a shade deeper
  than `--accent` so cream text on a red button clears WCAG AA),
  `--on-accent`.
- Trim and status: `--gold`, `--gold-bright`, `--gold-deep` (**brass** —
  the names predate the re-skin and were kept so every rule keeps
  working), `--oxblood` (the danger red), `--laurel` (success green),
  `--bronze`, `--bookmark-blue`, `--on-gold`.
- Dice: `--die-fill`, `--die-edge`, `--die-numeral`.
- Shape: `--radius` (12px), `--radius-lg` (18px), `--lip`, `--lip-small`.

Dark ("tavern night", the default) is leather brown (`#1c1411` /
`#2a1e19`) with cream text and a `#e8492e` accent. Light ("parchment")
swaps the surfaces for cream paper (`#f1e4c9` / `#fffaf0`), the outline
and lip for a dark brown ink (`#3a2519`), and darkens brass and red so
they still read on paper. Both are fully implemented: see `lib/theme.js`
+ `components/ThemeToggle.jsx` (a fixed button on every screen). Bare
`:root` holds the dark tokens, a `prefers-color-scheme: light` media
query provides the un-set default, and an explicit `[data-theme]`
attribute (set by the toggle, persisted to `localStorage`) wins in
either direction.

HP bars are the one place with their own colors, because they have to
read at a glance: green above half, amber down to a quarter, red below
(`.hp-track-fill-ok/-warn/-danger`).

### Typography

- **Display / headers / numbers**: `Fredoka` (Google Fonts) — rounded
  and chunky, the lettering that fits a sticker-style mascot. Numbers
  (HP, initiative, dice, ability scores) use it too, via `--font-mono`,
  with tabular figures so columns still line up — they're game numbers,
  not code, so there's no monospace font any more.
- **Body**: `Nunito` — rounded, very legible at small sizes for notes
  and stat blocks.
- No all-caps labels or wide letter-spacing: plain sentence/title case
  reads friendlier and faster.

Load via `fonts.googleapis.com` / `fonts.gstatic.com`, which the CSP in
`app/vercel.json` already allowlists.

### Ornament vocabulary

Reusable pieces in `app/src/components/ornament/`. Kept few and small —
they add character, never compete with content:

- **Stitched seam** (`FlowingDivider.jsx`, class `.seam`) — the rule
  under headers: two dashed "stitch" lines, like the stitching on the
  tome's leather, with a tiny black d20 in the middle.
- **Bookmark ribbons** (`PanelCrest.jsx`, via `Panel`'s `topRule` prop)
  — the tome's three bookmarks (blue, red, cream) peeking over the top
  edge of a screen's primary panel. Only on primary panels.
- **Brass-trimmed panel** (`.corner-frame` on `Panel`'s `corners` prop)
  — the primary panel gets a brass border and a brass lip instead of
  the ordinary dark outline, like the tome's corner caps.
- **Sticker panel** (`Panel.jsx`, `.panel`) — the base surface every
  card shares: `--surface-raised`, 2px `--outline`, rounded, with the
  lip shadow.
- **Die faces** (`Die.jsx`) — every rolled die is drawn as the
  mascot's d20: `--die-fill` body, `--die-numeral` numerals/pips. A
  natural max turns the edge and numeral brass; a natural 1 turns the
  edge red.
- `Laurel.jsx` (`LaurelFlourish`) is now a pass-through wrapper, kept so
  existing call sites didn't need touching; `GreekKeyRule.jsx` is unused.
- **Grain**: a very faint SVG-turbulence texture over the whole page
  (`body::before`, ~5% opacity, overlay blend) — leather in the dark
  theme, paper in the light one.

**Mascot and icons.** The mascot art lives at `app/public/mascot.png`
(512×512, transparent background). The Home screen shows it as its hero
image (`HomeScreen.jsx`, `.home-hero`, with a thin cream edge so its
dark outline doesn't vanish into the dark theme), and it doubles as the
manifest's 512px icon. The other installed-app icons are rendered from
the same art: `icon-192.png` (transparent), and `icon-maskable-512.png` /
`apple-touch-icon.png` (the mascot on a parchment square, inset so
Android's mask and iOS's rounded corners never clip it). The browser-tab
favicon stays the simple d20 (`public/icon.svg`): at 16px the full
illustration is unreadable. To change the art, replace `mascot.png` and
re-render the PNG icons from it.

Motion is light and tactile: screens fade/lift in on mount
(`.screen-enter`), sticker buttons press down onto their lip when
tapped, and dice tumble in when rolled. Nothing bouncy or slow enough to
make someone wait.

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

Inside a campaign, section navigation is a fixed bottom tab dock
(`BottomTabDock.jsx`, mobile-app style) rather than top text tabs. The
tabs, in order: **Party, Combat, Lore, Monsters, Notes** — plain words,
in the order a table uses them (players see Party, Combat, Notes). They
live in `lib/campaignTabs.jsx`, shared by `CampaignScreen.jsx` and the
character sheet. Route paths keep their original names (`characters`,
`combat`, `encyclopedia`, `bestiary`, `notes`) so old links still work;
only the labels changed. A left/right
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
(`--gold`/`--oxblood`/`--laurel`, `Fredoka`/`Nunito`), just at a
different scale and with its own centerpiece shape:

- **A whole screen, not a tab.** It's a sibling top-level route of
  `/campaigns/:campaignId`, *not* nested under `CampaignScreen`'s
  `Outlet` — no DM/Player chip, no "← Campaigns" chrome. It *does*
  carry the bottom tab dock (added in the ease-of-use pass, §3): a
  player's two main screens are this sheet and Combat, and switching
  between them shouldn't mean backing out to the Party list first. It resolves its own campaign/role via `useCampaignAccess()`
  (`lib/useCampaignAccess.js`, the same guest/account branch
  `CampaignScreen` does, factored out so this screen can opt out of the
  shared chrome without duplicating that logic badly) rather than
  reading the Outlet context. Its own `BackButton` goes to the Party roster
  (`CharactersScreen.jsx`, which now only lists cards and picks — actually
  opening one is this screen's job).
- **The hex stat plate** (`.stat-hex` / `.stat-hex-inner` in
  `index.css`) is this screen's one new shape, deliberately not reused
  elsewhere — two nested `clip-path` hexagons (brass outer, surface-
  colored inner, 2px gap faking a beveled border clip-path can't draw on
  its own) for AC/Initiative/Speed and the six ability scores. Modern
  (D&D Beyond-style hex ability scores) crossed with the classic paper
  sheet's layout, not a literal reproduction of either.
- **A live HP tracker**, not a static number — a gradient bar
  (`.hp-track`) that recolors as it depletes (green → amber → red at
  the 50%/25% thresholds) plus a delta input + Damage/Heal buttons that
  patch `currentHp` immediately. This is the thing that makes the screen
  worth returning to mid-combat, not just once at character creation.
- **Its own background treatment** — two soft radial gradients (a brass
  bloom behind the header, a red one low behind the footer) over the
  normal `--surface`, distinct from every other screen's flat
  radial-from-`--surface-glow` body background.
- **Edit-in-place, not a separate route.** Tapping "Edit Sheet" swaps the
  plate's read view for an ordinary `.field`-based form in the same spot
  — no navigation, no modal. `canEdit()` mirrors CharactersScreen's own
  DM-or-owning-player check (§4).

If a future screen wants its own distinct treatment too, that's fine —
just don't reach for the hex plate or this exact background gradient for
it. This vocabulary is reserved for the character sheet specifically, the
same way `.corner-frame`'s brass trim is reserved for "primary panel,"
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

### Ease-of-use pass (2026-09) — "focus on the game"

The brief: a player or DM should be able to focus on the game, not on
working out how to do something in the app. Simplicity over options.
The rules this pass settled on, worth keeping for anything new:

- **Plain words over app vocabulary.** Tabs are Party / Combat / Lore /
  Monsters / Notes (not Characters / Encyclopedia / Bestiary); buttons
  say "Add Character", "New Monster", "Invite Players" (not "Hand Out a
  Sheet"). Every Home choice carries a one-line explanation of who it's
  for.
- **Land where the game is.** A campaign opens on the tab you were last
  on (per campaign, per device — `dungeonbuddy.lastTab.<id>` in
  `localStorage`); first visit opens Party, where a player's own
  character sits first, marked "You". Players no longer start on Notes.
- **One obvious next step, not a menu.** The campaign hub shows your
  campaigns as big tap targets and hides the create form behind
  "+ New Campaign" (shown straight away only when there's nothing to
  pick). Party cards are one tap target each — name, class, HP bar, AC,
  conditions — with the full detail, edit, export and delete living on
  the sheet they open. Creating a character asks only for the basics
  (name, class, race, max HP, AC; they start at full HP); the rest goes
  on the sheet, which opens immediately. Empty states say what to do
  next and offer the button for it (an empty Party with no players yet
  offers Invite Players; the example templates stay hidden until a
  player exists to give a character to).
- **Invite by link, not by dictation.** `InvitePanel.jsx` (the DM's
  "Invite Players" button in the campaign header, account mode only)
  gives a `/join?code=…` link with Copy and, where the device supports
  it, the native Share sheet; the code is still shown as a fallback.
  The link lands on `JoinCampaignScreen.jsx` with the code already
  filled in ("You're Invited" — just pick a name). A visitor who's
  already logged in joins with the account they have — that screen used
  to bounce them to the dashboard and silently lose the code.
  Anonymous joined-players don't get "+ New Campaign" (they can't take a
  DM role anywhere else), and someone in offline mode can still follow
  an invite.
- **Nobody relays numbers.** Players roll their own initiative from
  their own token's combat panel on the Scene (a pulsing d20 prompts them), through
  `set_my_initiative()` (`006_player_initiative.sql`). "Hasn't rolled"
  is its own state (null, shown as "—"), and the DM's single **Begin
  Combat** button rolls for anyone who still hasn't — the old separate
  "Roll NPC Initiative" step is gone. The list scrolls the current
  combatant into view as the turn moves.
- **Floating controls never cover content.** Every centered screen
  (Home, log in, join, offline setup, reset) has bottom room for the
  dice button, and the campaign header keeps its role chip clear of the
  theme toggle.

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
read-only gate on `isDM` — they don't exist for a player at all. Under
the Scene pivot (§1/§7/§8), the same rule extends to the whole DM
toolkit: Party, Notes and the personal board are DM-only tabs too, and
the Scene's scene-management controls only render for the DM — a
player's tab bar collapses to Scene alone. `tabsForRole()` in
`lib/campaignTabs.jsx` drops DM-only tabs from the bottom dock for
anyone who isn't DM, `CampaignIndexRedirect` only ever restores a
remembered tab the role is allowed to see (falling back to Scene), and
`RequireDM` guards Lore, Monsters and Notes directly (bounces to Scene)
in case a player lands on one anyway (Party's route stays open — an
offline player creates their character there) —
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

### Hardening pass (2026-09, `007_hardening.sql`)

Anonymous sign-in means anyone holding an invite link becomes a real,
authenticated member in one click, so every policy has to hold against
a member calling the Supabase API directly, not just against what the
app's screens send. The review behind 007 was run against a real
Postgres 16 with a Supabase shim (`auth.uid()`/`auth.jwt()`, the
`anon`/`authenticated` roles): 16 attack cases and 22 normal-play cases,
the attacks confirmed open before 007 and closed after it. What it fixed,
and the rules to keep for any new table:

- **Rows never change campaign.** `keep_row_identity()` (a `zz_…` BEFORE
  UPDATE trigger, so it runs last) rejects a changed `campaign_id` and
  pins `id`/`created_at`; `keep_created_by()`/`keep_author_id()` pin
  authorship. Before 007 a player could move their note into another
  campaign.
- **Child rows take `campaign_id` from their parent**, never the client
  (`character_conditions` ← its sheet, `encounter_combatants` ← its
  encounter, and a combatant's character must be in the same campaign).
  Before 007, the DM of *any* campaign could put a condition on a sheet
  in someone else's campaign by claiming their own `campaign_id`. Any new
  table with a denormalized `campaign_id` needs the same trigger.
- **Rights end at the door.** A player's owner rights (edit their sheet,
  set initiative, edit notes, see hidden conditions on their sheet) now
  also require current membership — removing a player actually removes
  their access. They can still read and delete their own notes.
- **The DM's membership row can't be deleted** (they'd own a campaign
  they can't open); deleting the campaign cascades it instead.
- **Anonymous users can't create campaigns** — a restrictive policy on
  `auth.jwt() ->> 'is_anonymous'`, not just a hidden button.
- **Nothing a member writes is unbounded**: size checks on every text,
  array and jsonb column (added `NOT VALID`, so they bind new writes
  without failing the migration over old rows); dice rolls cap at 100
  dice and the log keeps the newest 200 per campaign.
- **Names aren't trusted**: the roll log stamps `display_name` from the
  roller's profile, and sign-up display names are trimmed, capped, and
  given a fallback in `handle_new_user()`.
- **Invites**: codes match case- and space-insensitively, a campaign caps
  at 50 members, and `regenerate_invite_code()` lets the DM retire a
  leaked link (the DM-only "Reset link" in the invite panel).
- **Sheets belong to members**: a sheet's `player_id` must be in the
  campaign when it's set or changed.

**The Party page's data (`008_party.sql`)** follows the same rules.
`messages` stamps `sender_id`/`created_at` server-side; a whisper
(`recipient_id` set) is readable only by its sender and recipient (not
the DM), and can only be sent to a current member. Messages can't be
edited, only deleted by their sender, and the newest 1000 per campaign
are kept. `party_items` is writable by any member (it's the party's
stash, not the DM's). Coins only move through `adjust_party_coins()`,
which is atomic and never lets the purse go negative. Presence runs on a
*private* Realtime channel (`presence:<campaign id>`) that RLS on
`realtime.messages` limits to the campaign's members. If a private join
is refused (008 not run yet), the client falls back to a public channel
with the same name so the feature still works. Its topic is the
campaign's UUID, so only someone who already knows that could listen,
and it carries names and "on Combat"-style status, nothing else. To
remove the fallback's exposure entirely, turn on "Private channels only"
in the project's Realtime settings once 008 is in.

Known, accepted: `is_campaign_member()`/`is_campaign_dm()` are callable by
any signed-in user, so someone who already knows both UUIDs can ask
whether a user is in a campaign — low value, and restricting them would
break the policies that call them. The app doesn't support Supabase's
CAPTCHA for anonymous sign-ins yet, so rely on its per-IP rate limit.

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
  in a fight and one applied from the sheet are the same write and
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
delete elsewhere just costs a harmless refetch). Live screens also
refetch when a backgrounded phone tab becomes visible again, since a
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

**The screens** — *superseded by the Scene (015, below): the fight now
lives on the tokens, `CombatScreen.jsx` and its tab are gone, and
`/campaigns/:id/combat` redirects to the Scene. The per-combatant row,
condition picker and Add Combatant form moved unchanged into
`components/CombatParts.jsx`, opened by tapping a token; the table-roll
panel became part of the scene log.* What the list tracker did (still
true of those parts):
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

Built (`006_player_initiative.sql`): `encounter_combatants.initiative`
becomes nullable, default null ("hasn't rolled"), and
`set_my_initiative(combatant_id, initiative)` — a security-definer
function that lets a player set initiative on a combatant row only if
it's their own character, and touches nothing else on the row. RLS is
row-level, not column-level, so opening an UPDATE policy to players
would have let them edit the whole row; the narrow function is the safe
shape. Before 006 runs, the app still works (new PCs just default to 0,
the old way) and a player's roll attempt says the migration is needed.

Built (`007_hardening.sql` — see §5 for the security side): players can
create their own character (the insert policy allows `player_id =
auth.uid()` for a member; the Party tab offers "Create My Character" to
a player who doesn't have one yet), `regenerate_invite_code()`, and
`campaign_members` joins the Realtime publication so the DM's Party tab
and Campaign Settings update the moment someone joins. Party
(`CharactersScreen`) and settings use `useCampaignLive()` (`lib/live.js`):
Realtime, plus a refetch when the tab becomes visible again and a slow
30s poll while it's visible, as a net for a backend where a table isn't
published yet.

**Campaign settings** (`components/CampaignSettings.jsx`, the gear in
the campaign title bar): the DM renames the campaign and edits its
description, sees everyone at the table and removes players (two-tap
`ConfirmButton`), and deletes the campaign by typing its name — the
delete cascades to everything in it. Players see who's at the table and
can leave (their character stays; rejoining gives it back). Offline,
the DM renames and either role deletes from the device, which also clears
that campaign's stored content. Also: "Change name" on the campaign hub
(updates both `profiles.display_name` and the auth metadata, anonymous
players included), and "Leave Table" for an anonymous player asks first —
with no email or password, signing out is permanent.

A fix worth remembering: `listCampaignMembers()` used to embed
`profiles(display_name)` in its `campaign_members` query, but the two
tables only share a foreign key target (`auth.users`), not a
relationship PostgREST can embed through — so it always failed, the
error was swallowed, and a DM saw "no players yet" however many had
joined. It's two plain queries now.

**The live Party page (`008_party.sql`)** — Party is the page a table
lives on, so it now shows the table itself, not just the characters:

- **At the table** (`components/TablePresence.jsx`, `lib/presence.js`) —
  everyone in the campaign, with a live dot for who's here right now and
  what they're doing ("on Combat", "on Mira's sheet", "in their notes"),
  or "away". Supabase Realtime Presence, one shared connection per
  campaign held by the campaign screens *and* the character sheet
  (ref-counted, closed a few seconds after the last screen lets go), so
  moving between screens never makes you flicker out and back in. Arrivals
  and departures pop a toast ("Bram sat down at the table", "…stepped
  away"). The first sync is the existing roster, so there are no toasts
  for people already there. Party cards show a live dot when their player
  is here. Tapping someone opens a whisper to them.
- **Characters · Stash · Talk** — a switcher under the strip, kept in the
  URL (`?view=talk&thread=<user id>`) so a toast can open a conversation.
- **Talk** (`components/TableTalk.jsx`, `lib/messages.js`) — one
  conversation with the whole table plus a private whisper thread with
  each other member (players passing the DM a note is the classic use).
  Held once per campaign in `CampaignScreen` (`useTableTalk()`), so the
  unread badge on the Party tab, the badge on Talk, and the "Wren
  whispered to you" toasts all agree. Read state is per device
  (`dungeonbuddy.read.<campaign id>` in localStorage). An open thread
  marks messages read as they arrive.
- **Stash** (`components/PartyStash.jsx`, `lib/stash.js`) — the party's
  coin purse in the five D&D denominations (with a gp-equivalent total)
  and shared loot: quantity, who carries it (free text, with character
  names suggested — loot also ends up on mules and NPCs), and a note.
  Works offline too, stored like every other guest content type.
- Offline campaigns get Characters and Stash; presence and Talk need an
  online campaign (there's nobody else on one device).

Tested with Playwright standing in for the Realtime server itself
(`page.routeWebSocket` speaking the Phoenix v2 JSON protocol). That
covers presence state and diffs, the private-channel refusal and public
fallback, and a `postgres_changes` insert delivering a whisper live,
plus the schema's security cases against real Postgres (§5).

**Donning characters (`009_characters.sql`)** — a player *wears* one
character per campaign at a time and can slip in and out:

- **The open pool.** `character_sheets.player_id` is nullable: NULL means
  nobody is wearing the character. That's either a DM pre-made (the Add
  Character "Played by" picker has "Nobody yet — a pre-made anyone can
  slip into") or one somebody slipped out of. It keeps its HP, gear and
  conditions. Party cards show an "Available" chip.
- **One at a time.** A trigger (`release_previous_character`) slips a
  player out of whatever they wore whenever they get a character by any
  route: slipping into one, creating one, bringing one from the roster,
  or the DM handing one over. A partial unique index backs it up.
  Campaigns that predate 009 keep each player's most recently updated
  character on them and move any extras to the pool (nothing deleted).
- **Slipping in/out** goes through `don_character()` and
  `doff_character()`. RLS can't safely express "claim a row nobody
  owns", and `player_id is null` in the update is the first-come,
  first-served guard. The DM helps anyone in or out (accidents, or a
  guest who lost their login and came back as someone new) with the
  "Played by" picker on the sheet (`SheetWearerBar.jsx`), which is a
  plain `player_id` update their policy already allows.
- **Choose your character** (`screens/ChooseCharacterScreen.jsx`,
  `/campaigns/:id/choose`) — where a new player lands after joining
  (unless they're still wearing a character from before), and where
  anyone comes back to swap. Its options:
  - slip into a character from the pool;
  - bring one from My Characters (accounts only);
  - create a new one — step by step or with the quick form (see
    **Guided builder** below) — optionally also kept in My Characters;
  - "Join the table without a character for now".

  The Party tab shows "You're playing X · Open Sheet · Change Character",
  or "You're at the table without a character · Choose a Character".
  Presence shows "choosing a character" while someone is on this screen.
- **My Characters** (`roster_characters`, `lib/roster.js`,
  `components/MyCharacters.jsx` on the campaign hub): an account
  holder's own characters, outside any campaign. Anonymous players have
  none (a restrictive policy); they create or slip into characters in
  the campaign instead.
  - Bringing one into a campaign makes a *copy* at full HP with
    resources refilled. HP, death saves and conditions stay with that
    campaign.
  - `character_sheets.roster_id` remembers the source, so **Save to My
    Characters** on the sheet copies progress (level, gear, features,
    abilities) back. It adds a new roster entry if the original was
    deleted.
  - Up to 100 characters per account.
- **Names read "Character (Player)"** — "Mira Duskwalker (Wren)" in At
  the table, Talk, toasts, and the roll log. The log's name is stamped
  server-side, so `dice_rolls.display_name` now allows 200 characters.
  CampaignScreen keeps a live `{ userId: character name }` map
  (`useWornCharacters`) so every label agrees.
- `QuickCharacterFields.jsx` is the one set of quick fields (name,
  class + level and race dropdowns with "Other…", max HP, AC), shared by
  the Party tab, the chooser and My Characters.
  `finalizeQuickFields()`, `explainCreateError()` and the dropdown
  helpers live in `lib/characters.js`.
- **Guided builder** (`components/CharacterBuilder.jsx`, rules in
  `lib/builder.js`) — the step-by-step alternative to the quick form,
  in the same three places. A "Step by step / Quick" switch picks
  between them. The last choice is remembered on the device
  (`lib/createMode.js`); otherwise players start step by step and the
  DM (stocking pre-mades) starts quick. Four steps:
  1. **Who**: name, class, level and species (the quick fields without
     HP/AC). A custom class asks for its hit die.
  2. **Abilities**: standard array, point buy (27 points, 8–15), 4d6
     drop lowest (the dropped die shown struck through), or typed in.
     "Best fit" places the array or rolls in the class's order of
     importance. Then the bonus: +2/+1, three +1s, +1 to all (classic
     Human) or none — deliberately not tied to species, so it suits
     both the 2014 and 2024 rules. Saving throw proficiencies are
     marked.
  3. **Story**: background (PHB 2014 + 2024 list, or Other), a
     one-line origin, the four personality prompts with an "Idea"
     button that offers an original prompt, and backstory. All
     optional; blank ones aren't sent, so a backend without 011 still
     takes the character.
  4. **Review**: a summary card, then **suggested** HP (max hit die +
     CON at 1st level, then the fixed average), AC (the class's usual
     starting armor, with how it was worked out) and speed (25 ft. for
     Dwarf, Halfling and Gnome). Each can be overridden, with a "Use
     suggested" to undo. Class trackers (Rage, Bardic Inspiration,
     Second Wind, Action Surge, Ki, Channel Divinity, Wild Shape, Lay on
     Hands, Sorcery Points, Pact Magic and spell slots by level) are
     added as ordinary resources, which can be switched off. The
     caller's own extras render here too ("Played by",
     "Also keep in My Characters").

  The builder only fills in fields the sheet already has — abilities,
  background, features (a "Hit Dice · Saving throws · Proficiency
  bonus" line), resources, speed and the 011 story fields — so nothing
  is enforced afterwards and no migration is needed.

Offline campaigns are unchanged: one person on one device, no pool,
roster or chooser.

**View as Player** (`lib/viewAs.js`) — the DM's role chip in the
campaign top bar is a switch: "View as Player" shows the campaign the
way players see it:
- the player tabs (Party, Combat, Notes);
- the "without a character / Choose a Character" Party banner and the
  chooser;
- the player's wearer bar on sheets;
- no Invite button, and no hidden conditions or other people's
  private or DM-only notes. Those are filtered client-side, because RLS
  still returns everything to the DM.

A dashed banner says so and offers "Back to DM View". The switch is
remembered per campaign, per device (so it holds across the campaign
tabs and a sheet). It is only a view: the database still treats them as
the DM, so anything done in it is real (slipping into a pre-made to test
it, for example). Campaign Settings keeps the real DM controls either
way. `useCampaignAccess()` returns the effective `isDM` plus `isRealDM`
and `previewAsPlayer`; CampaignScreen's Outlet context carries
`previewAsPlayer`.

**Private character details (`010_sheet_privacy.sql`).** Sheets used to
be readable in full by every member. Now the party sees only what it
needs: name, class, race, HP, AC, speed, death saves and visible
conditions, on Party cards and in Combat.

- Ability scores, background, gear, features and resources live in
  `character_details`, one row per sheet. The DM and whoever is wearing
  the character (while still a member) can read and write it; a pool
  character's details are DM-only until someone slips in.
- A trigger creates the row with the sheet, and it's deleted with it.
  Its `character_id` and `campaign_id` are pinned.
- The migration copies existing data across (only for sheets without a
  details row, so re-running never overwrites) and drops the columns
  from `character_sheets`. 007's size-limit loop now skips checks for
  columns that no longer exist, so re-running all migrations in order
  stays safe.
- `lib/characters.js` hides the split: `listSheets` merges both halves;
  `createSheet` and `updateSheet` route public and private fields to
  their tables and always return the whole sheet. A sheet whose details
  you can't see comes back `detailsHidden: true`, and the sheet shows a
  "Private" notice instead of default scores (the Markdown export says
  the same). On a backend without 010, everything falls back to the
  single table.
- A DM in View as Player also gets the "Private" treatment on
  characters they aren't wearing.
- **Deploy order:** after running 010, deploy this app version. Older
  builds still try to write the moved columns to `character_sheets`.

**The dashboard (campaign hub).** Account holders get two tabs:
- **Playing**: games you're a player in.
- **Running**: games you DM.

The tab is remembered per device. It defaults to Playing if you're in
anyone's game, otherwise Running. Anonymous players see only Playing,
with no tabs; offline mode is unchanged.

Every online campaign is a `DashboardCard`, fed by `lib/dashboard.js`.
That's one query per kind of data across all your campaigns, and each
piece is simply left out if it fails (e.g. no Talk before 008). A card
shows:
- **For players:** the character you're wearing, front and centre
  (initials, name, class · race, HP bar, AC), one tap to its sheet. With
  no character, "Choose a Character" goes to the chooser.
- **Fight status:** "Your turn!" (the whole card is highlighted), or
  "In combat · Round 3 · Goblin Boss's turn". Tapping it opens Combat.
- **Unread Talk:** the same per-device read state as the Party page.
  Tapping it opens Talk.
- **For DMs:** how many players are at the table.
- **Latest note** you can see, with its age.

The data refreshes whenever you come back to the tab. "Join with a
Code" and My Characters live under Playing; "+ New Campaign" and
import live under Running.

**A fuller character (`011_sheet_depth.sql`).** `character_details`
(private, 010) and `roster_characters` both gain:
- `backstory`;
- the four personality prompts: `personality_traits`, `ideals`,
  `bonds`, `flaws`;
- `inventory`: a list of `{ name, qty, note, equipped }`, up to 200
  items;
- `coins`: the character's own `{ pp, gp, ep, sp, cp }`, separate from
  the party purse.

On the sheet:
- `SheetInventory` (coins plus the item list) is edited in place: add
  items, change quantity, notes, equip/unequip, remove. Every change
  saves immediately.
- `SheetStory` shows the filled-in personality prompts and the
  backstory, trimmed with "Read the whole story". They're edited
  through Edit Sheet.
- The old `equipment` text is relabelled "Gear notes".
- Edit Sheet now sends only the fields that changed.

My Characters carries the new fields, so a character keeps its story
and belongings between campaigns; the Markdown export includes them. On
a backend with 010 but not 011, reads narrow to the 010 fields, and
writing a new field explains that 011 is needed.

**Remembered custom classes and races.** Anything typed via "Other…" in
this campaign's sheets (the Party tab), in the campaign plus My
Characters (the chooser), or in My Characters (the hub) is offered back
in the dropdowns under "Used in your games". It's derived from what's
already stored (`customOptions()` in `lib/characters.js`), so there's
nothing extra to manage.

**Invite codes you can say out loud (`012_word_invite_codes.sql`).**
New campaigns, and every "Reset link", get a code like
**`ember-wolf-417`**: 128 adjectives × 136 nouns × 900 numbers, about
15.7 million codes, from `new_invite_code()`. Existing campaigns keep
their old hex codes until the DM resets, so links already sent keep
working.

- **Forgiving matching.** Joining compares letters and digits only, so
  "Ember Wolf 417", "emberwolf417" and "ember_wolf_417" all work, on
  the server (via an index on the code with hyphens removed) and in
  `normalizeInviteCode()`.
- **Wrong guesses are limited.** A 15.7-million space is guessable
  where a trillion wasn't, so each account gets 10 wrong codes per
  hour (`join_attempts`, RLS-locked, written only by the join
  function). That's on top of Supabase's per-IP limit on anonymous
  sign-ins.
- **A wrong code returns NULL** instead of raising, so the recorded
  attempt isn't rolled back. The app shows the same "doesn't match"
  message.
- **The invite panel** shows the code large, to read out, next to the
  link.
- 007's code-format check now accepts hyphens too, so re-running it
  after 012 is safe. 007's older `join_campaign_with_code()` and
  `regenerate_invite_code()` get replaced again when 012 runs, which it
  does last when all migrations are run in order.

**Personal board (`013_personal_boards.sql`).** Notes has two views,
**Notes | My Board**, kept in the URL (`?view=board`).

My Board is a private sketch board, one per person per campaign
(`boards`, keyed on campaign + owner). The owner is stamped server-side,
and only the owner, while still a member, can read or write it: not the
party, not the DM. The DM's own board is equally private.

`PersonalBoard.jsx` is deliberately simple:
- five pen colours, stored by name and drawn from the theme's tokens,
  so boards read right in light and dark;
- Fine and Bold widths, an eraser, Undo and a two-tap Clear;
- auto-save 0.8s after the last stroke, with the status shown.

Storage details:
- Strokes are integer points in a fixed 1000 × 1250 space, so the board
  scales to any screen. The database caps a board at 1 MB (the app
  warns at 900 KB).
- Offline campaigns keep the board on the device; deleting the
  campaign clears it.
- Images on the board wait for Supabase Storage (with portraits).

**Portraits (`014_portraits.sql`).** Every character can have a picture:
on the sheet (large, in a brass ring), on Party cards, in the chooser, in
My Characters and on the dashboard. Without one, the character's
initials show on a colour of their own (`components/Portrait.jsx`).
- **Who can change it:** tapping the portrait on the sheet opens a
  picker for whoever can edit the sheet (the DM, or the player wearing
  it). Choose a picture, drag it into place and zoom, then Save. My
  Characters entries get the same picker in their edit form.
- **On the device first** (`lib/portraits.js`): the crop is drawn to a
  512 × 512 WebP (JPEG where the browser can't make WebP), about 15–40
  KB, before anything is uploaded.
- **Storage:** a private `portraits` bucket, one folder per character:
  `campaigns/<campaign>/sheets/<sheet>/…` or
  `users/<owner>/roster/<roster id>/…`. The row's `portrait_path`
  points at the file, and a check constraint keeps it inside that
  character's own folder.
- **Storage policies** read the path. Campaign members can view a
  campaign's portraits. The DM or the current wearer can add, replace
  and delete them, the same people who can edit the sheet. My
  Characters pictures are their owner's alone, and anonymous accounts
  can't have them. Only a real image under 1 MB is accepted, and a
  folder holds at most three files. Replacing a portrait deletes the
  old file, and deleting a character deletes its picture first, because
  afterwards nobody would be allowed to.
- **Showing them:** because the bucket is private, pictures load through
  one-hour signed links. Every portrait on screen is signed in one
  batched request, and links are cached until shortly before they
  expire.
- **Copying:** bringing a My Characters entry into a campaign copies its
  picture into the new sheet's folder, and Save to My Characters copies
  it back. Both are best effort: the character still moves if the copy
  fails.
- **Offline**, a 256px picture is kept on the sheet itself as a
  `data:` URL, and no storage is involved.
- **Before 014:** the upload error explains that the migration is
  needed, and My Characters falls back to its older columns.
  `app/vercel.json`'s CSP allows images from `https://*.supabase.co`
  (and `blob:`).
- **What isn't cleaned up:** a deleted campaign's pictures stay in the
  bucket, unreadable because nobody is a member any more. Supabase
  doesn't let SQL delete storage files, so clear them from the Storage
  dashboard if it matters.

**Sheet flair.** The sheet has some pageantry now, all CSS on top of
fields it already had:
- **Class colour:** each class has a hue (`classHue()` in
  `lib/builder.js`: Paladin azure, Druid green, Rogue violet, …). A
  custom class gets a stable hue made from its name. The colour shows as
  a band along the top of the plate, a halo behind the portrait, the
  class/species ribbon and the level badge. The theme decides the
  lightness (`.sheet-crest` tokens), so it reads on parchment and on
  leather.
- **Level:** a shield badge on the portrait, read from "Paladin 5"
  (`levelOf()`).
- **Proficiency:** a fourth hex beside Armor, Initiative and Speed,
  worked out from the level. On a phone all four fit on one row.
- **Headings:** section headings are "◆ RESOURCES ———" in brass.
- **Backstory:** it opens with a large first letter in the class colour.


**Campaign import from a JSON file** — an "Import a campaign file" link
at the bottom of `CampaignHubScreen` (it started as an upload icon beside
the old "Your Campaigns" heading, which the ease-of-use pass removed; no
dedicated screen — it's a one-shot action, not a flow worth its own
route). Picks a
`.json` file from device storage matching `campaign-template
.example.json` at the repo root — a campaign name/description plus
arrays of encyclopedia entries, bestiary stat blocks, and notes — and
creates the campaign and every row inside it. Deliberately **not** an
in-app AI call: the intended workflow is asking Claude (in chat, this
same session or a fresh one) to fill out that template for a given
premise, saving the result as a `.json` file, then importing it here —
no API key, no server endpoint, no new schema. `lib/campaignImport.js`
does the work in two pieces: `validateCampaignTemplate()` checks the
shape up front (so a malformed file fails with one plain message
instead of a half-imported campaign), and `importCampaignTemplate()`
creates everything through the *exact* same guest/account-aware
functions the manual "New Entry" forms already use
(`lib/campaigns.js`/`encyclopedia.js`/`bestiary.js`/`notes.js`) — an
imported entry is indistinguishable from a hand-typed one afterward:
same storage, same RLS, same edit/delete/export behavior.

**Scenes (`015_scenes.sql`) — the visual-aid pivot, §1.** The Scene
tab (`SceneScreen.jsx`, `/campaigns/:id/scene`) is a player's whole
surface and the DM's live-play screen.

Schema:
- `scenes` — `campaign_id`, `name`, `background_path` (the private
  `scenes` bucket, check-constrained into that scene's own folder),
  `active`, and `encounter_id` (the fight this scene is running, same
  campaign — trigger-checked). A partial unique index allows **one
  active scene per campaign**; `push_scene(id)` (DM-only, one
  transaction) swaps it. **Players can read only the active scene** —
  the DM's prep scenes, their tokens and their pictures are invisible to
  them (RLS on the rows, `scene_art_can_read()` on the files), so an
  ambush prepared in advance stays a surprise.
- `scene_tokens` — `scene_id`, `campaign_id` (from the scene, by
  trigger), and one of `character_id` (a PC), `combatant_id` (a monster
  in the fight; deleted with its combatant) or just `label` (a walk-on
  NPC: "The barkeep"). `x`/`y` are 0–1 fractions of the picture, so a
  scene lines up on every screen; `hidden` takes a PC off a scene (a
  split party). `unique (scene_id, character_id)`. HP, initiative and
  conditions are never stored on a token. The DM writes tokens
  directly; a player's only write is `place_my_token()` — their own
  worn character, on the live scene, x/y only (a token the DM hid stays
  hidden).
- `scene_events` — the log: `scene_id` (set null if the scene is
  deleted, so the timeline survives), `kind` (`auto` | `manual`),
  `text`. Members may add `auto` lines (a player's own HP change is
  logged from their device); only the DM adds `manual` lines or clears
  the log. That split is a UI promise more than a wall — a player
  calling the API could word an "auto" line themselves, accepted for a
  table of friends.
- The `scenes` storage bucket: 3 MB, WebP/JPEG/PNG, DM uploads, at most
  three files per scene folder. The picture is scaled to 1920px on the
  device first (1024px as a `data:` URL on the scene offline). Deleting
  a scene deletes its picture first, while the DM still may.
- Realtime publishes all three tables.

How the screen works (`SceneScreen.jsx`, `components/SceneStage.jsx`,
`SceneLog.jsx`, `CombatParts.jsx`, `lib/scenes.js`):
- **Tokens.** Every PC stands on every scene by default (online: worn
  characters — an unclaimed pre-made isn't at the table), spread along
  the bottom until someone moves them; a token row is only written the
  first time they're placed. Monsters and walk-ons appear at the first
  free spot across the top (`openSpot()`), never on top of anyone.
  Drag to move (the DM: anyone; a player: their own character, on the
  live scene), tap to open. Token dragging stops touch events from
  reaching CampaignScreen's tab swipe.
- **The fight is on the tokens.** "Start a Fight Here" creates an
  encounter linked to the scene and brings in every PC on it; the
  existing Add Combatant form adds monsters (each gets a token). Tokens
  show the turn (a pulsing ring), initiative, a health bar (a monster's
  quantized to its Healthy/Wounded/Bloodied/Near death band for
  players, exact for the DM) and condition tags; tapping one opens the
  old combat row — initiative, damage/heal, death saves, conditions. A
  strip of names under the fight header is the turn order (the DM's
  view used to auto-open whoever was up; once the scene went full
  screen that meant a sheet covering the picture every turn, so the
  turn spotlight moment does that job now). Ending the fight clears
  its monster tokens. A fight still open from the old list tracker, or
  started on another scene, can be moved here ("Run It on This
  Scene").
- **The DM's scenes** live in the toolbox: a picker (live one marked),
  + New Scene, Show to Players, rename, picture, add a walk-on, delete.
  Viewing a scene doesn't show it — `?scene=` in the URL is only the
  DM's own view.
- **The log** weaves `scene_events` with the table's dice rolls, newest
  first; a line from an earlier scene carries that scene's name. The
  app writes lines itself only for the **live** scene: a scene shown,
  a fight breaking out, someone entering or leaving it, combat
  beginning, each new round, health crossing into a new band ("Goblin 1
  is bloodied.", "Mira falls!"), conditions on and off, a walk-on
  appearing, a PC taken off or put back. The DM adds narrative lines
  ("Mira casts Lay on Hands"); players read. Offline, lines keep their
  stored order (same-millisecond lines don't shuffle).
- **Full screen** (Phase 6 step 1, below): the scene route escapes
  CampaignScreen's header, padding and dock (it renders just the
  outlet and the toasts). The picture is fitted to the viewport at its
  own shape (`--scene-ratio`, read from the image). Controls — title,
  the fight bar, a **menu** button (top right, with Talk's unread
  badge) and a **backpack** button (bottom right; the DM gets a
  **toolbox** instead) — show on a tap and, for players, hide again
  after 5 s untouched (never while a sheet or token is open); the DM's
  stay until dismissed. While hidden, token names, HP, initiative,
  conditions and the turn ring fade out (`.scene-info`). `<html
  data-immersive="controls|clean|sheet">` lets the global chrome
  follow: the floating theme toggle is hidden on the scene (theme moved
  into the menu — `applyTheme()` now announces changes so every toggle
  agrees), and the dice button shows only with the controls.
- **Sheets** slide up over the scene (`SceneSheet`): a tapped token's
  combat panel; the **backpack** (`Backpack.jsx` — your character with
  Open Full Sheet, what you carry via `SheetInventory`, the party
  Stash); the **menu** (`SceneMenu.jsx` — Talk with who's at the table,
  What happened (the log), change character, this campaign / campaign
  settings (leave lives there), invite, view as player, all campaigns,
  light/dark; the DM's also has Party, Lore, Monsters, Notes); and the
  DM's **toolbox** (scene, fight, narrate). Which sheet is open is
  `?panel=` in the URL, so a message toast or the hub's unread chip can
  open Talk directly.
- **Moments** (`lib/moments.js`): each render reduces the scene to a
  snapshot (per-token HP, band, conditions; whose turn; log lines and
  rolls), and every change against the previous snapshot becomes a
  moment: an arrival fades in, a hit shakes red with "−6" floating up
  (a monster's band for players — "Bloodied" — never its numbers), a
  heal glows green, a new condition pops its name, the turn gets a gold
  spotlight, new log lines and rolls become captions over the scene,
  and your turn flashes "Your turn!" with a vibration. No first-load or
  scene-switch replay; `prefers-reduced-motion` turns them into plain
  appear-and-vanish.
- **Pan, zoom, grid, measuring** (Phase 6 step 2, `016_scene_grid.sql`).
  The picture pans and zooms — pinch, mouse wheel / trackpad, drag the
  background; double-tap or "Whole scene" resets — up to 5×, always
  covering the view. Tokens scale by zoom^−0.6 so they stay readable
  without swamping a zoomed map; token positions are still picture
  fractions, so dragging works at any zoom. A background drag that moves
  is a pan, never a tap, so it doesn't toggle the controls. The DM lays
  a **grid** from the toolbox, fitted live over the scene ("squares
  across" and what a square is worth): `scenes.grid_size` (a square's
  width as a fraction of the picture's width) and `grid_feet`. With a
  grid, the DM gets a **ruler** beside the toolbox: dragging draws a
  line reading out whole squares × feet (`measureFeet()`, straight
  line). The line is **never stored** — it goes out live on the
  broadcast channel `scene:<campaign id>` (`lib/sceneLive.js`; 016's
  `realtime.messages` policies let members listen and only the DM
  send, with the same public-channel fallback as presence), throttled
  to ~12/s but always ending where the finger stopped, lingers 1.5 s
  after release, and players drop it after 4 s of silence. Only the
  live scene's line is shared.
- **The DM's quick bar** (`017_dm_quick_tools.sql`). The principle: if
  running a session from the app is slower than not using it, the DM
  won't. So the DM's controls are a bar of seven (Scene, Map, Mood,
  Party, Announce, Look up, Fight), each opening a sheet
  of presets over the scene — most things are two taps:
  - **Scene** — every scene as a picture tile (tap = go there), and a
    new scene from any **built-in backdrop** in one tap (eight top-down
    maps in `public/backdrops/`: tavern, forest road, cave, dungeon
    room, city street, ship deck, castle hall, campfire — precached for
    offline). "Show to players straight away" (on by default) makes
    tapping showing. A built-in is stored as `background_path =
    'builtin:<id>'` (017 widens the path check); More can swap a
    scene's backdrop or upload a picture. More backdrops are planned.
  - **Mood** — `scenes.mood` (`{ time, weather, light, magic }`, one
    choice per group; `lib/mood.js`). Twelve presets (Cozy inn, Stormy
    night, Haunted, Deep dungeon, Pitch black, Winter road, Misty dawn,
    Dread, Blood rite, Sanctuary, The rift opens, Clear) and every layer
    on its own: dawn/day/dusk/night tints; rain, snow, fog, storm (with
    lightning); firelight flicker, torchlight and darkness cut away
    around the party's tokens (the DM sees darkness at half strength);
    eerie green, blood moon, holy light, a portal, a heartbeat pulse.
    CSS/SVG in `SceneMood.jsx`, inside the stage so it pans and zooms;
    tints under the tokens, weather over them; still under
    reduced-motion. It reaches players like any scene change (Realtime
    on `scenes`).
  - **Announce** — `scene_events` gains `style` (`line` | `call` |
    `title` | `handout`), `body`, and `to_user`. A **call** ("Roll
    initiative!") is a banner with a buzz; ten presets plus the DM's
    own ("★ Keep", saved per campaign on this device). A **title card**
    ("Night falls", "Chapter Two") fills every screen for five seconds.
    A **handout** — a Lore entry or text written on the spot — lands as
    a parchment card each player reads and puts away (and can reopen
    from the log). Any of them can go to **one player**: RLS shows a
    `to_user` line only to them and the DM, and a player can't aim or
    style anything (they still only add plain automatic lines). Calls,
    title cards and handouts sit above any open sheet.
  - **Look up** — one search across Lore, Monsters and Notes, read over
    the scene: a monster's stat block with "Add to the Fight" (how
    many, initiative rolled, a token each), Lore or a note with "Show
    as a Handout", and a link to its full tab.
  - **Fight** — start one, add combatants, or bring over a fight
    running elsewhere (turn controls stay at the top of the scene).
  - **Map** — this scene's name, backdrop or own picture, walk-ons,
    delete, the grid, and the map tools below (fog, markers, spell
    areas). A quiet narrated line lives in Announce → Line. The ruler
    and "Pick tokens" sit by the menu.
- **Tokens that work for a DM** (`018_tokens_for_the_dm.sql`). Moving
  a party one token at a time was the first thing that made the app
  slower than a table, so:
  - **Pick tokens** (top bar) — tap tokens to pick them, or "Whole
    party"; tap the map and the group walks there in the same shape;
    drag any picked token and they all follow. Marching orders: single
    file, two abreast, circle (`lib/formations.js`).
  - **Snap to the grid** whenever a scene has one: an odd-sized token
    sits in a square, an even-sized one on the corner between four.
  - **Sizes** — Medium, Large, Huge, Gargantuan (`scene_tokens.size`,
    squares across), set from a token's panel.
  - **Hidden until revealed** — `scene_tokens.dm_only`: placed but
    invisible to players (RLS; the DM sees it faded with a dashed edge).
    Set up the ambush before the session, then "Reveal to Players" (or
    Reveal on a picked group) — it arrives as a moment and a log line.
  - **Monsters before a fight** — Look up → a monster → "Place on the
    Scene" (how many, hidden by default) makes tokens that remember
    their Bestiary entry (`creature_id`). Starting a fight brings every
    revealed one in with its stats; revealing one mid-fight adds it.
    Hidden ones stay out of the turn order, so it can't give them away.
  - **Ping** — the DM holds a finger on the map: a ripple there on every
    screen (broadcast like the measuring line, never stored).
- **The DM's eyes** (also 018). A **Party** sheet on the quick bar:
  every character's HP, AC, passive Perception (10 + WIS — sheets don't
  track skill proficiency), speed, conditions and whether they're
  dying, tap to open. A monster's token shows its **stat block** — the
  combatant (or placed token) remembers its Bestiary entry. With tokens
  picked, the group bar can **damage, heal or add a condition to all of
  them** (a Fireball on four goblins is one tap; tokens with no HP are
  skipped). Conditions can be **timed** — 1, 2, 3 rounds, a minute,
  ten minutes: the timer lives on the encounter (`encounters.timers`),
  shows as ⧗ on the chip, and when a new round starts expired ones come
  off with a log line. The dice roller has a **secret roll** switch in
  a shared campaign — that roll stays on your device.
- **Exploration visuals** (`019_fog_and_marks.sql`):
  - **Fog of war** — Map → Cover the Map in Fog, then paint rooms open
    (Reveal / Hide brush, three sizes). Stored as strokes on
    `scenes.fog` (points 0–1000 across width and height, replayed in
    order), drawn as a blurred SVG mask. The DM sees through it at half
    strength; players see darkness, except their own tokens (which sit
    above it). Players aren't just shown fog over things — monster and
    NPC tokens and markers in fogged spots are left out entirely
    (`inFog()`), and the turn order says "Something unseen" rather than
    naming them. Spell areas stay (the party sees its own Fireball).
  - **Markers** — door, trap (hidden by default), loot, label:
    `scene_marks` rows, same RLS as tokens (`dm_only` = the trap no one
    has found yet). Revealing one logs "A trap is revealed!".
  - **Spell areas** — circle, cube, cone, line, sized in feet by the
    grid, with presets (Fireball, Spirit Guardians, Darkness, Fog
    Cloud, Thunderwave, Web, Burning Hands, a 30 ft breath, Cone of
    Cold, Lightning Bolt, Wall of Fire) and a custom one. Tap to place;
    cones and lines are aimed by dragging from where they start. Its
    label sits off the edge (the middle is usually under a monster);
    tapping it offers resize, turn, colour, reveal/hide, remove — and
    **Pick Everyone Inside**, which hands the group bar exactly the
    tokens in the area, ready for "Damage all".
  - While a map tool or the ruler is in hand, taps go through tokens
    and marks to the map beneath.
- **NPCs** (`020_npcs.sql`). Standard fare first, room to grow in a
  pinch:
  - **Archetypes** (`lib/npcs.js`) — commoner, innkeeper, merchant,
    blacksmith, farmer, guard, captain, noble, priest, sage, mage,
    scout, spy, knight, bandit, thug, cultist. Each has an emblem
    (`NpcEmblem`, a glyph on a coloured disc) and SRD-like AC/HP/Dex.
    People → NPCs → tap one to drop a nameless token ("Guard 2") onto
    the scene: a `scene_tokens` row with just `archetype` set.
  - **The cast** — `npcs` rows: name (with a Suggest-a-Name button),
    archetype, a public one-line look, attitude (friendly / neutral /
    wary / hostile, shown as the token's ring colour), optional Bestiary
    stat block that overrides the archetype's stats, and `met`. Placed
    tokens point at them by `npc_id`. A nameless token's panel has
    **Make Them Somebody**, which turns it into a cast member in place.
  - **Who we've met** — players can read only `met` NPCs (RLS). An NPC
    becomes met when the DM ticks it, or when its token is shown on the
    live scene (placed visible, revealed, or pushed with the scene).
    Players tap the token to see its card; the backpack's **Met** tab
    lists them all.
  - **Fights** — Start a Fight enlists monsters plus hostile NPCs and
    the generic foes (bandit, thug, cultist); anyone else can **Join the
    Fight** from their token panel. Stats come from the stat block, else
    the NPC's own numbers, else the archetype.
- **Navigation.** Tabs are Scene, Party, Lore, Monsters, Notes for the
  DM (the dock shows on the backstage tabs; on the scene the menu gets
  there); a player has only the Scene. Notes and the personal board are
  DM-only (`RequireDM`); the sheet's and Choose screen's back buttons
  return a player to the Scene. Offline, a guest *player* sees that the
  DM runs the scene on their own device.

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
  scheduled: random encounter/loot tables, a session-log/recap feed (the
  scene log above covers much of this; a per-session recap is still
  open).

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
5. **Scene pivot** — done (§1/§7, `015_scenes.sql`). The player-facing
   surface is a single Scene: a DM-uploaded picture with tokens showing
   where the party and monsters stand, the tokens doubling as the combat
   tracker (turn, initiative, health, conditions; the list-based Combat
   tab is gone), tap a token to open its sheet or combat controls, and
   a log of what happened (automatic + DM-written lines, plus dice
   rolls). Party, Lore, Monsters and Notes are DM-only; Talk and Stash
   moved onto the Scene. To use it on a deployed backend, run
   `db/migrations/015_scenes.sql`.
6. **The companion** — in progress (§1, "The companion principle").
   Four steps, each shipped and verified before the next:
   1. **Full-screen shell + live action moments** — done (§7, Scenes).
      The scene fills the
      screen for players and the DM, with no campaign header, tab dock or
      panels. Tap to show controls: a **backpack** button (the sheet,
      your inventory and the party stash, as one sheet sliding up over
      the scene) and a **menu** button (Talk with an unread badge, the
      log, change character, leave, back to campaigns). While controls
      show, tokens show their HP, turn and conditions; tapping a token
      opens its combat panel as before. **Moments:** damage flashes
      red with the number floating up (players see a monster's band
      change, not numbers), healing glows green, a condition's name pops
      onto the token, newcomers fade in, the fallen dim, and each new
      log line appears as a caption that fades. "Your turn!" flashes
      full-screen with `navigator.vibrate`. Moments come from comparing
      each refetch with the last one, so they play the same on every
      device and need no new tables. The **DM's toolbox** is a drawer
      over the same scene: scene picker, show to players, edit scene
      (picture, walk-ons), the fight (start, add, begin, next turn,
      end), narrate a log line. Lore, Monsters, Notes and Party move to
      the DM's menu. Honour `prefers-reduced-motion` (moments become
      simple fades).
   2. **Pan, zoom, grid, measuring** — done (§7, Scenes). Pinch/wheel zoom and drag-to-pan
      (token positions stay 0–1 fractions of the picture, so they're
      unaffected). A per-scene grid the DM can switch on and size
      ("one square = 5 ft", cell size in picture fractions — a new
      column on `scenes`). A measuring line that reads out distance in
      feet — **DM only**, shown to everyone while it's held.
   3. **Spell areas and markers — DM only** — done (§7, Exploration
      visuals).
   4. **Atmosphere** — done: mood presets and layers in the DM's quick
      bar, and fog of war (§7).
   5. **Atmosphere for the rest of the app** (to do, after step 4). The
      same philosophy everywhere, not just on the scene: minimal chrome,
      rich visuals. Home, sign-in, the campaign hub, the character
      sheet (backpack), Choose Character, and the DM's backstage
      screens (Party, Lore, Monsters, Notes) get the scene's treatment:
      one clear thing per screen, controls out of the way until needed,
      and mood — ambient backgrounds, gentle motion, the campaign's live
      scene picture bleeding through behind the hub card and the sheet.
      Scope it screen by screen before building; keep every screen
      usable with `prefers-reduced-motion`.
7. **Polish**: offline sync queue, guest→account migration, campaign
   invite-flow UI beyond the raw code field, tagging (see §7 — needs
   scoping first), structured inventory/currency (a real item list with
   weight/gold instead of `character_sheets.equipment`'s one freeform
   text field), and an assisted level-up flow (recomputing HP/proficiency
   bonus instead of hand-editing `class_and_level` text) — the last two
   explicitly scoped out of Phase 4 (§7) as real but non-combat-blocking
   gaps.

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
    Party, Combat, Lore, Monsters, Notes, reached via the bottom tab dock, not
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
