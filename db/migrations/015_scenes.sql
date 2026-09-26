-- Dungeon Buddy — Supabase schema, migration 15 of N: scenes (the
-- visual-aid pivot — BIBLE.md §1/§7/§8). Requires 001-014 (uses
-- is_campaign_member(), is_campaign_dm(), stamp_created_by(),
-- touch_updated_at(), keep_row_identity(), encounters,
-- encounter_combatants, character_sheets). Safe to re-run.
--
--   - scenes: a DM-authored backdrop (a picture in the private "scenes"
--     bucket). Exactly one per campaign may be active: that's the one the
--     players see. The rest are the DM's prep, invisible to players.
--   - scene_tokens: where someone stands on a scene, in 0–1 coordinates.
--     HP, initiative and conditions are never stored here — a PC token
--     reads its character sheet, a monster token reads its combatant.
--   - scene_events: the running log ("Goblin 1 enters the fray",
--     "Round 2", "Mira casts Lay on Hands"), one timeline per campaign,
--     each line remembering the scene it happened in.

-- ---------------------------------------------------------------------
-- scenes
-- ---------------------------------------------------------------------
create table if not exists scenes (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references campaigns (id) on delete cascade,
  name            text not null default 'Scene' check (char_length(name) between 1 and 120),
  background_path text,
  active          boolean not null default false,
  encounter_id    uuid references encounters (id) on delete set null,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table scenes drop constraint if exists scenes_background_path_check;
alter table scenes add constraint scenes_background_path_check check (
  background_path is null
  or (char_length(background_path) <= 300
      and starts_with(background_path, 'campaigns/' || campaign_id || '/scenes/' || id || '/'))
);

create index if not exists scenes_campaign_idx on scenes (campaign_id);
-- One live scene per campaign. push_scene() below swaps it atomically.
create unique index if not exists scenes_one_active on scenes (campaign_id) where active;

-- The fight a scene is running has to be one of this campaign's.
create or replace function check_scene_encounter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.encounter_id is not null and not exists (
    select 1 from encounters where id = new.encounter_id and campaign_id = new.campaign_id
  ) then
    raise exception 'That encounter isn''t in this campaign' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists a_scenes_check_encounter on scenes;
create trigger a_scenes_check_encounter
  before insert or update on scenes
  for each row execute function check_scene_encounter();

drop trigger if exists scenes_stamp_created_by on scenes;
create trigger scenes_stamp_created_by
  before insert on scenes
  for each row execute function stamp_created_by();

drop trigger if exists scenes_touch_updated_at on scenes;
create trigger scenes_touch_updated_at
  before update on scenes
  for each row execute function touch_updated_at();

drop trigger if exists zz_scenes_keep_identity on scenes;
create trigger zz_scenes_keep_identity
  before update on scenes
  for each row execute function keep_row_identity();

alter table scenes enable row level security;

-- Players see only the live scene — the DM's prep stays a surprise.
drop policy if exists "scenes: dm sees all, members see the live one" on scenes;
create policy "scenes: dm sees all, members see the live one" on scenes
  for select using (
    is_campaign_dm(campaign_id, auth.uid())
    or (active and is_campaign_member(campaign_id, auth.uid()))
  );

drop policy if exists "scenes: only dm writes" on scenes;
create policy "scenes: only dm writes" on scenes
  for all using (is_campaign_dm(campaign_id, auth.uid())) with check (is_campaign_dm(campaign_id, auth.uid()));

-- Show a scene to the table: it becomes the only active one.
create or replace function push_scene(p_scene_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign uuid;
begin
  select campaign_id into v_campaign from scenes where id = p_scene_id;
  if v_campaign is null or not is_campaign_dm(v_campaign, auth.uid()) then
    raise exception 'Only the DM can change the scene' using errcode = '42501';
  end if;
  update scenes set active = false where campaign_id = v_campaign and active and id <> p_scene_id;
  update scenes set active = true where id = p_scene_id;
end;
$$;

revoke all on function push_scene(uuid) from public;
grant execute on function push_scene(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- scene_tokens
-- ---------------------------------------------------------------------
create table if not exists scene_tokens (
  id           uuid primary key default gen_random_uuid(),
  scene_id     uuid not null references scenes (id) on delete cascade,
  campaign_id  uuid not null references campaigns (id) on delete cascade,
  character_id uuid references character_sheets (id) on delete cascade,
  combatant_id uuid references encounter_combatants (id) on delete cascade,
  label        text check (label is null or char_length(label) between 1 and 120),
  x            real not null default 0.5 check (x between 0 and 1),
  y            real not null default 0.5 check (y between 0 and 1),
  -- A PC the DM has taken off this scene (a split party). PCs are shown
  -- on every scene by default, so "not here" needs a row of its own.
  hidden       boolean not null default false,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (scene_id, character_id)
);

create index if not exists scene_tokens_scene_idx on scene_tokens (scene_id);
create index if not exists scene_tokens_campaign_idx on scene_tokens (campaign_id);

-- campaign_id comes from the scene, never the client; a token's
-- character or combatant has to live in the same campaign.
create or replace function scene_tokens_inherit_campaign()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign uuid;
begin
  select campaign_id into v_campaign from scenes where id = new.scene_id;
  if v_campaign is null then
    raise exception 'That scene doesn''t exist' using errcode = '23503';
  end if;
  new.campaign_id := v_campaign;
  if new.character_id is not null and not exists (
    select 1 from character_sheets where id = new.character_id and campaign_id = v_campaign
  ) then
    raise exception 'That character isn''t in this campaign' using errcode = '42501';
  end if;
  if new.combatant_id is not null and not exists (
    select 1 from encounter_combatants where id = new.combatant_id and campaign_id = v_campaign
  ) then
    raise exception 'That combatant isn''t in this campaign' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists a_scene_tokens_inherit_campaign on scene_tokens;
create trigger a_scene_tokens_inherit_campaign
  before insert or update on scene_tokens
  for each row execute function scene_tokens_inherit_campaign();

drop trigger if exists scene_tokens_stamp_created_by on scene_tokens;
create trigger scene_tokens_stamp_created_by
  before insert on scene_tokens
  for each row execute function stamp_created_by();

drop trigger if exists scene_tokens_touch_updated_at on scene_tokens;
create trigger scene_tokens_touch_updated_at
  before update on scene_tokens
  for each row execute function touch_updated_at();

drop trigger if exists zz_scene_tokens_keep_identity on scene_tokens;
create trigger zz_scene_tokens_keep_identity
  before update on scene_tokens
  for each row execute function keep_row_identity();

alter table scene_tokens enable row level security;

drop policy if exists "scene tokens: dm sees all, members see the live scene's" on scene_tokens;
create policy "scene tokens: dm sees all, members see the live scene's" on scene_tokens
  for select using (
    is_campaign_dm(campaign_id, auth.uid())
    or (
      is_campaign_member(campaign_id, auth.uid())
      and exists (select 1 from scenes s where s.id = scene_id and s.active)
    )
  );

drop policy if exists "scene tokens: only dm writes" on scene_tokens;
create policy "scene tokens: only dm writes" on scene_tokens
  for all using (is_campaign_dm(campaign_id, auth.uid())) with check (is_campaign_dm(campaign_id, auth.uid()));

-- A player moving their own character on the live scene — the one write
-- a player gets here, and only x/y (a token the DM hid stays hidden).
create or replace function place_my_token(p_scene_id uuid, p_character_id uuid, p_x real, p_y real)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_x is null or p_y is null or p_x < 0 or p_x > 1 or p_y < 0 or p_y > 1 then
    raise exception 'A token has to stay on the scene';
  end if;
  if not exists (
    select 1
    from scenes s
    join character_sheets cs on cs.campaign_id = s.campaign_id
    where s.id = p_scene_id
      and s.active
      and cs.id = p_character_id
      and cs.player_id = auth.uid()
      and is_campaign_member(s.campaign_id, auth.uid())
  ) then
    raise exception 'You can only move your own character on the live scene' using errcode = '42501';
  end if;
  insert into scene_tokens (scene_id, character_id, x, y)
  values (p_scene_id, p_character_id, p_x, p_y)
  on conflict (scene_id, character_id) do update set x = excluded.x, y = excluded.y;
end;
$$;

revoke all on function place_my_token(uuid, uuid, real, real) from public;
grant execute on function place_my_token(uuid, uuid, real, real) to authenticated;

-- ---------------------------------------------------------------------
-- scene_events — the log. Anyone at the table can add an automatic line
-- (a player's own HP change crossing into "Bloodied" is logged from
-- their device); only the DM writes narrative lines or clears it. That
-- split is a UI promise more than a wall: a player calling the API
-- directly could word an "auto" line themselves, which at a table of
-- friends is worth the simplicity of not routing every log line through
-- the server.
-- ---------------------------------------------------------------------
create table if not exists scene_events (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  scene_id    uuid references scenes (id) on delete set null,
  kind        text not null default 'auto' check (kind in ('auto', 'manual')),
  text        text not null check (char_length(text) between 1 and 500),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  -- contentStore's generic list() orders by updated_at; a line never
  -- changes, so this just mirrors created_at (same as dice_rolls).
  updated_at  timestamptz not null default now()
);

create index if not exists scene_events_campaign_idx on scene_events (campaign_id, created_at desc);

create or replace function check_scene_event_campaign()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.scene_id is not null and not exists (
    select 1 from scenes where id = new.scene_id and campaign_id = new.campaign_id
  ) then
    raise exception 'That scene isn''t in this campaign' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists a_scene_events_check_campaign on scene_events;
create trigger a_scene_events_check_campaign
  before insert on scene_events
  for each row execute function check_scene_event_campaign();

drop trigger if exists scene_events_stamp_created_by on scene_events;
create trigger scene_events_stamp_created_by
  before insert on scene_events
  for each row execute function stamp_created_by();

alter table scene_events enable row level security;

drop policy if exists "scene events viewable by campaign members" on scene_events;
create policy "scene events viewable by campaign members" on scene_events
  for select using (is_campaign_member(campaign_id, auth.uid()));

drop policy if exists "scene events: dm writes any, members write auto lines" on scene_events;
create policy "scene events: dm writes any, members write auto lines" on scene_events
  for insert with check (
    is_campaign_dm(campaign_id, auth.uid())
    or (kind = 'auto' and is_campaign_member(campaign_id, auth.uid()))
  );

drop policy if exists "dm clears the scene log" on scene_events;
create policy "dm clears the scene log" on scene_events
  for delete using (is_campaign_dm(campaign_id, auth.uid()));

-- ---------------------------------------------------------------------
-- Storage: scene backgrounds in a private "scenes" bucket, at
--   campaigns/<campaign>/scenes/<scene>/<random>.<webp|jpg|png>
-- The DM uploads; members can read a live scene's picture (the DM, all
-- of them). Same shape as the portraits bucket in 014.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scenes', 'scenes', false, 3145728, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function scene_art_can_read(p_name text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  parts text[] := string_to_array(p_name, '/');
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if auth.uid() is null
     or coalesce(array_length(parts, 1), 0) <> 5
     or parts[1] <> 'campaigns' or parts[3] <> 'scenes'
     or parts[2] !~ uuid_re or parts[4] !~ uuid_re then
    return false;
  end if;
  return exists (
    select 1 from scenes s
    where s.id = parts[4]::uuid
      and s.campaign_id = parts[2]::uuid
      and (is_campaign_dm(s.campaign_id, auth.uid()) or (s.active and is_campaign_member(s.campaign_id, auth.uid())))
  );
end;
$$;

create or replace function scene_art_can_write(p_name text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  parts text[] := string_to_array(p_name, '/');
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if auth.uid() is null
     or coalesce(array_length(parts, 1), 0) <> 5
     or parts[1] <> 'campaigns' or parts[3] <> 'scenes'
     or parts[2] !~ uuid_re or parts[4] !~ uuid_re
     or parts[5] !~ '^[a-z0-9-]{8,64}\.(webp|jpg|png)$' then
    return false;
  end if;
  return exists (
    select 1 from scenes s
    where s.id = parts[4]::uuid
      and s.campaign_id = parts[2]::uuid
      and is_campaign_dm(s.campaign_id, auth.uid())
  );
end;
$$;

create or replace function scene_art_folder_count(p_name text)
returns bigint
language sql
stable
set search_path = public
as $$
  select count(*)
  from storage.objects
  where bucket_id = 'scenes'
    and starts_with(name, array_to_string((string_to_array(p_name, '/'))[1:4], '/') || '/');
$$;

revoke all on function scene_art_can_read(text) from public;
revoke all on function scene_art_can_write(text) from public;
revoke all on function scene_art_folder_count(text) from public;
grant execute on function scene_art_can_read(text) to authenticated;
grant execute on function scene_art_can_write(text) to authenticated;
grant execute on function scene_art_folder_count(text) to authenticated;

drop policy if exists "scenes: members see the art" on storage.objects;
create policy "scenes: members see the art" on storage.objects
  for select to authenticated
  using (bucket_id = 'scenes' and public.scene_art_can_read(name));

drop policy if exists "scenes: dm uploads" on storage.objects;
create policy "scenes: dm uploads" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'scenes'
    and public.scene_art_can_write(name)
    and public.scene_art_folder_count(name) < 3
  );

drop policy if exists "scenes: dm replaces" on storage.objects;
create policy "scenes: dm replaces" on storage.objects
  for update to authenticated
  using (bucket_id = 'scenes' and public.scene_art_can_write(name))
  with check (bucket_id = 'scenes' and public.scene_art_can_write(name));

drop policy if exists "scenes: dm deletes" on storage.objects;
create policy "scenes: dm deletes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'scenes' and public.scene_art_can_write(name));

-- ---------------------------------------------------------------------
-- Realtime: a pushed scene, a moved token and a new log line reach every
-- phone without a reload. RLS applies per subscriber as usual.
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['scenes', 'scene_tokens', 'scene_events']
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
