-- Dungeon Buddy — Supabase schema, migration 10 of N: private character
-- details. Requires 001-009. Safe to re-run.
--
-- Until now every member of a campaign could read every character sheet
-- in full. The party genuinely needs some of it — Party cards and the
-- Combat tab show each character's name, class, race, HP, AC, speed and
-- death saves — but ability scores, background, gear, features and
-- resources are the player's own business (and the DM's).
--
-- Postgres RLS is row-level, not column-level, so the private fields move
-- to their own table, character_details, one row per sheet:
--
--   - readable and writable by the DM, and by whoever is wearing the
--     character (while they're still in the campaign);
--   - created automatically with every new sheet, deleted with it;
--   - a character in the open pool (nobody wearing it) is DM-only until
--     someone slips into it.
--
-- The moved columns are dropped from character_sheets once copied. The
-- app reads and writes both tables (lib/characters.js) and still works
-- against a database that hasn't run this yet — but after running it,
-- deploy the matching app version, or older builds can't save sheets.

create table if not exists character_details (
  character_id uuid primary key references character_sheets (id) on delete cascade,
  -- Denormalized for cheap RLS, same as character_conditions.campaign_id;
  -- always taken from the sheet, never the client.
  campaign_id  uuid not null references campaigns (id) on delete cascade,
  background   text not null default '' check (char_length(background) <= 200),
  abilities    jsonb not null default '{"str":10,"dex":10,"con":10,"int":10,"wis":10,"cha":10}'
               check (octet_length(abilities::text) <= 2000),
  equipment    text not null default '' check (char_length(equipment) <= 20000),
  features     text not null default '' check (char_length(features) <= 20000),
  resources    jsonb not null default '[]'
               check (jsonb_typeof(resources) = 'array' and jsonb_array_length(resources) <= 50 and octet_length(resources::text) <= 20000),
  updated_at   timestamptz not null default now()
);

create index if not exists character_details_campaign_idx on character_details (campaign_id);

-- Every sheet gets its details row the moment it's created.
create or replace function create_character_details()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into character_details (character_id, campaign_id)
  values (new.id, new.campaign_id)
  on conflict (character_id) do nothing;
  return new;
end;
$$;

drop trigger if exists character_sheets_create_details on character_sheets;
create trigger character_sheets_create_details
  after insert on character_sheets
  for each row execute function create_character_details();

-- Which character and campaign a details row belongs to never changes.
create or replace function keep_details_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.character_id := old.character_id;
  new.campaign_id := old.campaign_id;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists zz_character_details_keep_identity on character_details;
create trigger zz_character_details_keep_identity
  before update on character_details
  for each row execute function keep_details_identity();

-- The DM, or whoever is wearing the character right now.
create or replace function can_see_character_details(p_character_id uuid, p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_campaign_dm(p_campaign_id, auth.uid())
      or (
        is_campaign_member(p_campaign_id, auth.uid())
        and exists (select 1 from character_sheets where id = p_character_id and player_id = auth.uid())
      );
$$;

revoke all on function can_see_character_details(uuid, uuid) from public;
grant execute on function can_see_character_details(uuid, uuid) to authenticated;

alter table character_details enable row level security;

drop policy if exists "dm or wearer reads character details" on character_details;
create policy "dm or wearer reads character details" on character_details
  for select using (can_see_character_details(character_id, campaign_id));

drop policy if exists "dm or wearer updates character details" on character_details;
create policy "dm or wearer updates character details" on character_details
  for update using (can_see_character_details(character_id, campaign_id))
  with check (can_see_character_details(character_id, campaign_id));

-- No insert/delete policies: rows come and go with their sheet.

-- ---------------------------------------------------------------------
-- Move the private fields over (only for sheets that don't have a
-- details row yet, so re-running never overwrites newer details), then
-- drop them from the shared table. Each column is copied only if it's
-- still there.
-- ---------------------------------------------------------------------
do $$
declare
  has_background boolean := exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'character_sheets' and column_name = 'background');
  has_abilities  boolean := exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'character_sheets' and column_name = 'abilities');
  has_equipment  boolean := exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'character_sheets' and column_name = 'equipment');
  has_features   boolean := exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'character_sheets' and column_name = 'features');
  has_resources  boolean := exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'character_sheets' and column_name = 'resources');
begin
  execute format(
    'insert into character_details (character_id, campaign_id, background, abilities, equipment, features, resources)
     select cs.id, cs.campaign_id, %s, %s, %s, %s, %s
     from character_sheets cs
     where not exists (select 1 from character_details d where d.character_id = cs.id)',
    case when has_background then 'left(coalesce(cs.background, ''''), 200)' else '''''' end,
    case when has_abilities  then 'coalesce(cs.abilities, ''{"str":10,"dex":10,"con":10,"int":10,"wis":10,"cha":10}''::jsonb)' else '''{"str":10,"dex":10,"con":10,"int":10,"wis":10,"cha":10}''::jsonb' end,
    case when has_equipment  then 'coalesce(cs.equipment, '''')' else '''''' end,
    case when has_features   then 'coalesce(cs.features, '''')' else '''''' end,
    case when has_resources  then 'coalesce(cs.resources, ''[]''::jsonb)' else '''[]''::jsonb' end
  );
end;
$$;

alter table character_sheets
  drop column if exists background,
  drop column if exists abilities,
  drop column if exists equipment,
  drop column if exists features,
  drop column if exists resources;

-- What's left on the shared sheet keeps a size limit (007's combined
-- check covered background too, so it went with that column).
alter table character_sheets drop constraint if exists character_sheets_public_fields_len;
alter table character_sheets add constraint character_sheets_public_fields_len
  check (char_length(class_and_level) <= 200 and char_length(race) <= 200 and char_length(speed) <= 200) not valid;

-- Live updates for the owner and DM (RLS applies per subscriber).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'character_details'
  ) then
    alter publication supabase_realtime add table public.character_details;
  end if;
end;
$$;
