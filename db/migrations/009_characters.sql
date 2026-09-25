-- Dungeon Buddy — Supabase schema, migration 9 of N: donning characters.
-- Requires 001-008. Safe to re-run.
--
-- A player *wears* (dons) at most one character per campaign, and can
-- slip in and out of them:
--
--   - character_sheets.player_id becomes nullable. NULL = the character
--     is in the campaign's open pool — a DM pre-made, or one somebody
--     slipped out of — keeping its HP, gear and conditions, and anyone at
--     the table can slip into it (first come, first served).
--   - Slipping into a character slips you out of the one you had on
--     (a trigger), and a partial unique index guarantees one per player.
--   - don_character() / doff_character() are how players slip in and out
--     (RLS can't express "claim an unowned row" safely); the DM just sets
--     player_id directly to help someone in or out.
--   - roster_characters: an account holder's own characters ("My
--     Characters"), outside any campaign. Bringing one into a campaign
--     copies it; character_sheets.roster_id remembers where a sheet came
--     from so "Save to My Characters" can copy progress back.
--   - The roll log names a roller by their character: "Mira (Wren)".

-- ---------------------------------------------------------------------
-- 1. The open pool: a character nobody is wearing.
-- ---------------------------------------------------------------------
alter table character_sheets alter column player_id drop not null;

-- 007's membership check, now skipping an unworn (NULL) character.
create or replace function check_sheet_player()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.player_id is not null
     and (tg_op = 'INSERT' or new.player_id is distinct from old.player_id)
     and not is_campaign_member(new.campaign_id, new.player_id) then
    raise exception 'That player isn''t in this campaign' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- One character at a time: putting one on takes off the one you had.
-- Fires for every way a player gets a character — donning from the pool,
-- creating one, bringing one from the roster, the DM handing one over.
create or replace function release_previous_character()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.player_id is not null and (tg_op = 'INSERT' or new.player_id is distinct from old.player_id) then
    update character_sheets
    set player_id = null
    where campaign_id = new.campaign_id and player_id = new.player_id and id <> new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists b_character_sheets_release_previous on character_sheets;
create trigger b_character_sheets_release_previous
  before insert or update of player_id on character_sheets
  for each row execute function release_previous_character();

-- Campaigns created before this rule may have a player holding several
-- characters: keep the most recently updated one on them and put the
-- rest in the pool (nothing is deleted), then enforce the rule.
with ranked as (
  select id, row_number() over (partition by campaign_id, player_id order by updated_at desc, created_at desc) as rn
  from character_sheets
  where player_id is not null
)
update character_sheets set player_id = null
where id in (select id from ranked where rn > 1);

create unique index if not exists character_sheets_one_per_player
  on character_sheets (campaign_id, player_id)
  where player_id is not null;

-- ---------------------------------------------------------------------
-- 2. Slipping in and out.
-- ---------------------------------------------------------------------
create or replace function don_character(p_sheet_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign uuid;
begin
  select campaign_id into v_campaign from character_sheets where id = p_sheet_id;
  if v_campaign is null then
    raise exception 'That character no longer exists';
  end if;
  if not is_campaign_member(v_campaign, auth.uid()) then
    raise exception 'Only members of this campaign can play its characters';
  end if;

  -- "player_id is null" is the first-come-first-served guard: of two
  -- players tapping the same character at once, only one update matches.
  update character_sheets set player_id = auth.uid()
  where id = p_sheet_id and player_id is null;

  if not found then
    if exists (select 1 from character_sheets where id = p_sheet_id and player_id = auth.uid()) then
      return; -- already wearing it
    end if;
    raise exception 'Someone else is already playing that character';
  end if;
end;
$$;

revoke all on function don_character(uuid) from public;
grant execute on function don_character(uuid) to authenticated;

-- Slip out of whatever you're wearing in this campaign; it goes back to
-- the pool with everything on it intact.
create or replace function doff_character(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update character_sheets set player_id = null
  where campaign_id = p_campaign_id and player_id = auth.uid();
end;
$$;

revoke all on function doff_character(uuid) from public;
grant execute on function doff_character(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. My Characters — an account holder's own roster.
-- ---------------------------------------------------------------------
create table if not exists roster_characters (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users (id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 120),
  class_and_level text not null default '' check (char_length(class_and_level) <= 200),
  race            text not null default '' check (char_length(race) <= 200),
  background      text not null default '' check (char_length(background) <= 200),
  abilities       jsonb not null default '{"str":10,"dex":10,"con":10,"int":10,"wis":10,"cha":10}'
                  check (octet_length(abilities::text) <= 2000),
  armor_class     integer,
  max_hp          integer,
  speed           text not null default '30 ft.' check (char_length(speed) <= 200),
  equipment       text not null default '' check (char_length(equipment) <= 20000),
  features        text not null default '' check (char_length(features) <= 20000),
  resources       jsonb not null default '[]'
                  check (jsonb_typeof(resources) = 'array' and jsonb_array_length(resources) <= 50 and octet_length(resources::text) <= 20000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists roster_characters_owner_idx on roster_characters (owner_id);

-- The owner is always the caller; a roster tops out at 100 characters.
create or replace function stamp_roster_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.owner_id := auth.uid();
  if (select count(*) from roster_characters where owner_id = auth.uid()) >= 100 then
    raise exception 'My Characters holds up to 100 characters — delete one to make room';
  end if;
  return new;
end;
$$;

drop trigger if exists roster_characters_stamp_owner on roster_characters;
create trigger roster_characters_stamp_owner
  before insert on roster_characters
  for each row execute function stamp_roster_owner();

create or replace function keep_roster_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.id := old.id;
  new.owner_id := old.owner_id;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists zz_roster_characters_keep_identity on roster_characters;
create trigger zz_roster_characters_keep_identity
  before update on roster_characters
  for each row execute function keep_roster_identity();

drop trigger if exists roster_characters_touch_updated_at on roster_characters;
create trigger roster_characters_touch_updated_at
  before update on roster_characters
  for each row execute function touch_updated_at();

alter table roster_characters enable row level security;

drop policy if exists "owners manage their roster" on roster_characters;
create policy "owners manage their roster" on roster_characters
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- A roster needs an account to come back to — not for anonymous players.
drop policy if exists "anonymous users have no roster" on roster_characters;
create policy "anonymous users have no roster" on roster_characters
  as restrictive
  for insert
  with check (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

-- Where a campaign sheet came from, for "Save to My Characters". Just a
-- pointer: writing back still goes through the roster's own RLS.
alter table character_sheets add column if not exists roster_id uuid;
alter table character_sheets drop constraint if exists character_sheets_roster_id_fkey;
alter table character_sheets add constraint character_sheets_roster_id_fkey
  foreign key (roster_id) references roster_characters (id) on delete set null;

-- ---------------------------------------------------------------------
-- 4. The roll log names the character you're wearing: "Mira (Wren)".
-- ---------------------------------------------------------------------
alter table dice_rolls drop constraint if exists dice_rolls_display_name_check;
alter table dice_rolls add constraint dice_rolls_display_name_check
  check (char_length(display_name) between 1 and 200);

create or replace function stamp_roll_display_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player text := coalesce((select display_name from profiles where id = auth.uid()), 'Someone');
  v_character text := (
    select name from character_sheets
    where campaign_id = new.campaign_id and player_id = auth.uid()
    limit 1
  );
begin
  new.display_name := case when v_character is null then v_player else v_character || ' (' || v_player || ')' end;
  return new;
end;
$$;
