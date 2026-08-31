-- Codex — Supabase schema, migration 4 of N: character sheets +
-- conditions. Requires 001_core.sql and 002_world_building.sql (uses
-- is_campaign_member(), stamp_created_by(), touch_updated_at()). Safe to
-- re-run.
--
-- Two tables, deliberately split, because they have different write
-- permissions on what would otherwise be the same row:
--
--   - character_sheets: the mechanical sheet (stats, HP, equipment). The
--     DM hands one out by creating it assigned to a player_id; after
--     that, either the DM or that player can edit it.
--   - character_conditions: debilitations/boons layered onto a sheet —
--     "add a curse," "mark them exhausted." Postgres RLS is row-level,
--     not column-level, so giving players write access to their own
--     sheet row while keeping conditions DM-only requires a separate
--     table rather than one more column on character_sheets. Only the
--     DM can ever insert/update/delete a row here — that's the actual
--     mechanism behind "the DM can secretly debilitate a player."
--     `visible_to_party` (default true) additionally lets a DM keep a
--     condition hidden from the rest of the table while the affected
--     player still always sees their own — a curse only that player and
--     the DM know about, say.

-- Reused by both tables below, and a cheap generalization of the
-- "exists (select 1 from campaigns c where c.id = campaign_id and
-- c.dm_id = auth.uid())" check already inlined a couple of times in
-- 002_world_building.sql.
create or replace function is_campaign_dm(p_campaign_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from campaigns
    where id = p_campaign_id and dm_id = p_user_id
  );
$$;

revoke all on function is_campaign_dm(uuid, uuid) from public;
grant execute on function is_campaign_dm(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- character_sheets
-- ---------------------------------------------------------------------
create table if not exists character_sheets (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references campaigns (id) on delete cascade,
  player_id     uuid not null references auth.users (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 120),
  class_and_level text not null default '',
  race          text not null default '',
  background    text not null default '',
  abilities     jsonb not null default '{"str":10,"dex":10,"con":10,"int":10,"wis":10,"cha":10}',
  armor_class   integer,
  max_hp        integer,
  current_hp    integer,
  speed         text not null default '30 ft.',
  equipment     text not null default '',
  features      text not null default '',
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists character_sheets_campaign_idx on character_sheets (campaign_id);
create index if not exists character_sheets_player_idx on character_sheets (player_id);

drop trigger if exists character_sheets_stamp_created_by on character_sheets;
create trigger character_sheets_stamp_created_by
  before insert on character_sheets
  for each row execute function stamp_created_by();

drop trigger if exists character_sheets_touch_updated_at on character_sheets;
create trigger character_sheets_touch_updated_at
  before update on character_sheets
  for each row execute function touch_updated_at();

alter table character_sheets enable row level security;

drop policy if exists "sheets viewable by campaign members" on character_sheets;
create policy "sheets viewable by campaign members" on character_sheets
  for select using (is_campaign_member(campaign_id, auth.uid()));

-- Only the DM hands out a new sheet (assigns it to a player_id).
drop policy if exists "dm creates a sheet" on character_sheets;
create policy "dm creates a sheet" on character_sheets
  for insert with check (is_campaign_dm(campaign_id, auth.uid()));

-- The DM or the owning player can edit the mechanical sheet itself.
-- Conditions/debilitations are NOT on this table — see below.
drop policy if exists "dm or owner updates a sheet" on character_sheets;
create policy "dm or owner updates a sheet" on character_sheets
  for update using (
    is_campaign_dm(campaign_id, auth.uid()) or player_id = auth.uid()
  ) with check (
    is_campaign_dm(campaign_id, auth.uid()) or player_id = auth.uid()
  );

drop policy if exists "dm or owner deletes a sheet" on character_sheets;
create policy "dm or owner deletes a sheet" on character_sheets
  for delete using (
    is_campaign_dm(campaign_id, auth.uid()) or player_id = auth.uid()
  );

-- ---------------------------------------------------------------------
-- character_conditions — DM-only write, always. This is the whole
-- mechanism: a player can freely edit their own character_sheets row,
-- but has no insert/update/delete policy on this table at all, so there
-- is no way for them to add, remove, or alter a condition on their own
-- sheet — only the DM can.
-- ---------------------------------------------------------------------
create table if not exists character_conditions (
  id               uuid primary key default gen_random_uuid(),
  character_id     uuid not null references character_sheets (id) on delete cascade,
  -- Denormalized from character_sheets.campaign_id so RLS here doesn't
  -- need a join for every check — one extra column, much simpler and
  -- cheaper policies.
  campaign_id      uuid not null references campaigns (id) on delete cascade,
  label            text not null check (char_length(label) between 1 and 120),
  note             text not null default '',
  visible_to_party boolean not null default true,
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists character_conditions_character_idx on character_conditions (character_id);
create index if not exists character_conditions_campaign_idx on character_conditions (campaign_id);

drop trigger if exists character_conditions_stamp_created_by on character_conditions;
create trigger character_conditions_stamp_created_by
  before insert on character_conditions
  for each row execute function stamp_created_by();

drop trigger if exists character_conditions_touch_updated_at on character_conditions;
create trigger character_conditions_touch_updated_at
  before update on character_conditions
  for each row execute function touch_updated_at();

alter table character_conditions enable row level security;

-- The DM always sees every condition. The affected player always sees
-- their own, regardless of visible_to_party — hiding a debilitation
-- from the character it's afflicting isn't the point of that flag, only
-- hiding it from the rest of the party is. Everyone else on the same
-- campaign only sees it when visible_to_party is true.
drop policy if exists "conditions viewable by dm, owner, or party if visible" on character_conditions;
create policy "conditions viewable by dm, owner, or party if visible" on character_conditions
  for select using (
    is_campaign_dm(campaign_id, auth.uid())
    or exists (
      select 1 from character_sheets cs
      where cs.id = character_conditions.character_id and cs.player_id = auth.uid()
    )
    or (visible_to_party and is_campaign_member(campaign_id, auth.uid()))
  );

drop policy if exists "only dm writes conditions" on character_conditions;
create policy "only dm writes conditions" on character_conditions
  for all using (is_campaign_dm(campaign_id, auth.uid())) with check (is_campaign_dm(campaign_id, auth.uid()));
