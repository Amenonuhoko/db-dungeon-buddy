-- Dungeon Buddy — Supabase schema, migration 18 of N: tokens that work
-- for a DM, and the DM's eyes in a fight (BIBLE.md §7, Scenes). Requires
-- 001-017. Safe to re-run.
--
--   - scene_tokens gain a size (squares across: 1 = Medium … 4 =
--     Gargantuan), `dm_only` (placed but not yet revealed — invisible to
--     players until the DM reveals it: the ambush behind the door), and
--     `creature_id` (a monster placed from the Bestiary before any fight,
--     so it can join one with its stats).
--   - encounter_combatants remember their Bestiary entry (`creature_id`),
--     so a monster's token can show its stat block.
--   - encounters.timers: conditions that run out — [{ key, label,
--     until }] where key is "pc:<sheet>" or "c:<combatant>" and `until` is
--     the round it ends at.

alter table scene_tokens
  add column if not exists size smallint not null default 1,
  add column if not exists dm_only boolean not null default false,
  add column if not exists creature_id uuid references bestiary_entries (id) on delete set null;

alter table scene_tokens drop constraint if exists scene_tokens_size_check;
alter table scene_tokens add constraint scene_tokens_size_check check (size between 1 and 4);

alter table encounter_combatants
  add column if not exists creature_id uuid references bestiary_entries (id) on delete set null;

alter table encounters add column if not exists timers jsonb not null default '[]';
alter table encounters drop constraint if exists encounters_timers_check;
alter table encounters add constraint encounters_timers_check check (
  jsonb_typeof(timers) = 'array' and octet_length(timers::text) <= 20000
);

-- A Bestiary entry on a token or combatant has to be this campaign's.
create or replace function check_creature_campaign()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.creature_id is not null and not exists (
    select 1 from bestiary_entries where id = new.creature_id and campaign_id = new.campaign_id
  ) then
    raise exception 'That creature isn''t in this campaign' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Named "b_" so it runs after the "a_" triggers that set campaign_id.
drop trigger if exists b_scene_tokens_check_creature on scene_tokens;
create trigger b_scene_tokens_check_creature
  before insert or update on scene_tokens
  for each row execute function check_creature_campaign();

drop trigger if exists b_encounter_combatants_check_creature on encounter_combatants;
create trigger b_encounter_combatants_check_creature
  before insert or update on encounter_combatants
  for each row execute function check_creature_campaign();

-- Players never see a token the DM hasn't revealed.
drop policy if exists "scene tokens: dm sees all, members see the live scene's" on scene_tokens;
create policy "scene tokens: dm sees all, members see the live scene's" on scene_tokens
  for select using (
    is_campaign_dm(campaign_id, auth.uid())
    or (
      not dm_only
      and is_campaign_member(campaign_id, auth.uid())
      and exists (select 1 from scenes s where s.id = scene_id and s.active)
    )
  );
