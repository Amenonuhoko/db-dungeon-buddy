-- Codex — Supabase schema, migration 5 of N: live play (Phase 4 — see
-- BIBLE.md §7/§8). Requires 001-004 (uses is_campaign_member(),
-- is_campaign_dm(), stamp_created_by(), touch_updated_at(), and the
-- character_sheets table). Safe to re-run.
--
--   - encounters / encounter_combatants: the initiative tracker. DM-only
--     writes, readable by the whole campaign, live via Realtime.
--   - character_sheets gains resources (spell slots, Ki, Rage… as
--     freeform {label, max, current} counters) and death saves.
--   - dice_rolls: the shared, table-wide roll log.

-- ---------------------------------------------------------------------
-- encounters — one row per fight. `current_combatant_id` rather than a
-- turn index: an index into "combatants ordered by initiative" silently
-- points at someone else the moment a combatant is added or removed
-- mid-fight; an id keeps pointing at whoever's actually up.
-- ---------------------------------------------------------------------
create table if not exists encounters (
  id                   uuid primary key default gen_random_uuid(),
  campaign_id          uuid not null references campaigns (id) on delete cascade,
  name                 text not null default 'Encounter' check (char_length(name) between 1 and 120),
  round                integer not null default 1 check (round >= 1),
  current_combatant_id uuid,
  active               boolean not null default true,
  created_by           uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists encounters_campaign_idx on encounters (campaign_id);

drop trigger if exists encounters_stamp_created_by on encounters;
create trigger encounters_stamp_created_by
  before insert on encounters
  for each row execute function stamp_created_by();

drop trigger if exists encounters_touch_updated_at on encounters;
create trigger encounters_touch_updated_at
  before update on encounters
  for each row execute function touch_updated_at();

alter table encounters enable row level security;

drop policy if exists "encounters viewable by campaign members" on encounters;
create policy "encounters viewable by campaign members" on encounters
  for select using (is_campaign_member(campaign_id, auth.uid()));

drop policy if exists "only dm writes encounters" on encounters;
create policy "only dm writes encounters" on encounters
  for all using (is_campaign_dm(campaign_id, auth.uid())) with check (is_campaign_dm(campaign_id, auth.uid()));

-- ---------------------------------------------------------------------
-- encounter_combatants — one row per participant in one encounter.
-- For a PC (character_id set), HP and conditions are NOT stored here:
-- character_sheets.current_hp/max_hp and character_conditions stay the
-- single source of truth, so a hit taken in combat and one applied from
-- the character sheet are the same write. The hp/ac/conditions columns
-- below only matter for monsters/NPCs (character_id null).
-- ---------------------------------------------------------------------
create table if not exists encounter_combatants (
  id           uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references encounters (id) on delete cascade,
  -- Denormalized so RLS doesn't need a join per row — same reasoning as
  -- character_conditions.campaign_id.
  campaign_id  uuid not null references campaigns (id) on delete cascade,
  character_id uuid references character_sheets (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 120),
  initiative   integer not null default 0,
  dex_modifier integer not null default 0,
  is_pc        boolean not null default false,
  armor_class  integer,
  max_hp       integer,
  current_hp   integer,
  conditions   text[] not null default '{}',
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists encounter_combatants_encounter_idx on encounter_combatants (encounter_id);
create index if not exists encounter_combatants_campaign_idx on encounter_combatants (campaign_id);

drop trigger if exists encounter_combatants_stamp_created_by on encounter_combatants;
create trigger encounter_combatants_stamp_created_by
  before insert on encounter_combatants
  for each row execute function stamp_created_by();

drop trigger if exists encounter_combatants_touch_updated_at on encounter_combatants;
create trigger encounter_combatants_touch_updated_at
  before update on encounter_combatants
  for each row execute function touch_updated_at();

alter table encounter_combatants enable row level security;

drop policy if exists "combatants viewable by campaign members" on encounter_combatants;
create policy "combatants viewable by campaign members" on encounter_combatants
  for select using (is_campaign_member(campaign_id, auth.uid()));

drop policy if exists "only dm writes combatants" on encounter_combatants;
create policy "only dm writes combatants" on encounter_combatants
  for all using (is_campaign_dm(campaign_id, auth.uid())) with check (is_campaign_dm(campaign_id, auth.uid()));

-- ---------------------------------------------------------------------
-- character_sheets: resources + death saves. Covered by that table's
-- existing "DM or owning player" update policy — no new policy needed.
-- ---------------------------------------------------------------------
alter table character_sheets
  add column if not exists resources jsonb not null default '[]',
  add column if not exists death_save_successes smallint not null default 0,
  add column if not exists death_save_failures smallint not null default 0;

alter table character_sheets drop constraint if exists character_sheets_death_save_successes_check;
alter table character_sheets add constraint character_sheets_death_save_successes_check
  check (death_save_successes between 0 and 3);
alter table character_sheets drop constraint if exists character_sheets_death_save_failures_check;
alter table character_sheets add constraint character_sheets_death_save_failures_check
  check (death_save_failures between 0 and 3);

-- ---------------------------------------------------------------------
-- dice_rolls — the shared table log. Any member can post their own roll
-- (created_by is stamped server-side from auth.uid(), never trusted from
-- the client) and read every roll in campaigns they belong to. Rolls are
-- a history, not editable — no update policy; only the DM can clear.
-- ---------------------------------------------------------------------
create table if not exists dice_rolls (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references campaigns (id) on delete cascade,
  display_name text not null default 'Someone' check (char_length(display_name) between 1 and 60),
  expression   text not null check (char_length(expression) between 1 and 60),
  rolls        jsonb not null default '[]',
  total        integer not null,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  -- contentStore's generic list() orders by updated_at; a roll never
  -- changes, so this just mirrors created_at.
  updated_at   timestamptz not null default now()
);

create index if not exists dice_rolls_campaign_idx on dice_rolls (campaign_id, created_at desc);

drop trigger if exists dice_rolls_stamp_created_by on dice_rolls;
create trigger dice_rolls_stamp_created_by
  before insert on dice_rolls
  for each row execute function stamp_created_by();

alter table dice_rolls enable row level security;

drop policy if exists "rolls viewable by campaign members" on dice_rolls;
create policy "rolls viewable by campaign members" on dice_rolls
  for select using (is_campaign_member(campaign_id, auth.uid()));

drop policy if exists "members post their own rolls" on dice_rolls;
create policy "members post their own rolls" on dice_rolls
  for insert with check (is_campaign_member(campaign_id, auth.uid()));

drop policy if exists "dm clears the roll log" on dice_rolls;
create policy "dm clears the roll log" on dice_rolls
  for delete using (is_campaign_dm(campaign_id, auth.uid()));

-- ---------------------------------------------------------------------
-- Realtime. The first tables in the app that need it — this is what
-- makes the DM's "Next Turn" (and every HP change, condition, and roll)
-- appear on players' phones without a reload. character_sheets and
-- character_conditions are included because a PC's HP/conditions in the
-- combat view live there, not on encounter_combatants. Supabase
-- Realtime applies each table's RLS select policy per subscriber, so
-- nobody receives rows they couldn't already read. Guarded so re-running
-- this file doesn't error on "already a member of the publication".
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['encounters', 'encounter_combatants', 'character_sheets', 'character_conditions', 'dice_rolls']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
