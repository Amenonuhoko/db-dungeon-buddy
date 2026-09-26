-- Dungeon Buddy — Supabase schema, migration 17 of N: the DM's quick
-- tools (BIBLE.md §7, "The DM's quick bar"). Requires 001-016. Safe to
-- re-run.
--
--   - scenes.background_path may name a built-in backdrop
--     ("builtin:tavern") instead of an uploaded picture.
--   - scenes.mood: the atmosphere laid over the picture —
--     { time, weather, light, magic }, each one preset name or absent.
--   - scene_events can be announcements: `style` is a plain log line, a
--     call ("Roll initiative!"), a title card, or a handout (with `body`),
--     and `to_user` aims one at a single player, whom alone (and the DM)
--     it's visible to.

-- ---------------------------------------------------------------------
-- Built-in backdrops
-- ---------------------------------------------------------------------
alter table scenes drop constraint if exists scenes_background_path_check;
alter table scenes add constraint scenes_background_path_check check (
  background_path is null
  or background_path ~ '^builtin:[a-z0-9-]{1,40}$'
  or (char_length(background_path) <= 300
      and starts_with(background_path, 'campaigns/' || campaign_id || '/scenes/' || id || '/'))
);

-- ---------------------------------------------------------------------
-- Mood
-- ---------------------------------------------------------------------
alter table scenes add column if not exists mood jsonb not null default '{}';

alter table scenes drop constraint if exists scenes_mood_check;
alter table scenes add constraint scenes_mood_check check (
  jsonb_typeof(mood) = 'object' and octet_length(mood::text) <= 1000
);

-- ---------------------------------------------------------------------
-- Announcements
-- ---------------------------------------------------------------------
alter table scene_events
  add column if not exists style text not null default 'line',
  add column if not exists body text,
  add column if not exists to_user uuid references auth.users (id) on delete cascade;

alter table scene_events drop constraint if exists scene_events_style_check;
alter table scene_events add constraint scene_events_style_check check (style in ('line', 'call', 'title', 'handout'));
alter table scene_events drop constraint if exists scene_events_body_check;
alter table scene_events add constraint scene_events_body_check check (body is null or char_length(body) <= 8000);

-- Aimed at someone means aimed at a member of this campaign.
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
  if new.to_user is not null and not is_campaign_member(new.campaign_id, new.to_user) then
    raise exception 'That player isn''t in this campaign' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- A line aimed at one player is theirs and the DM's alone.
drop policy if exists "scene events viewable by campaign members" on scene_events;
create policy "scene events viewable by campaign members" on scene_events
  for select using (
    is_campaign_member(campaign_id, auth.uid())
    and (to_user is null or to_user = auth.uid() or is_campaign_dm(campaign_id, auth.uid()))
  );

-- Players still only add the app's own plain lines to the whole table.
drop policy if exists "scene events: dm writes any, members write auto lines" on scene_events;
create policy "scene events: dm writes any, members write auto lines" on scene_events
  for insert with check (
    is_campaign_dm(campaign_id, auth.uid())
    or (kind = 'auto' and style = 'line' and to_user is null and body is null and is_campaign_member(campaign_id, auth.uid()))
  );
