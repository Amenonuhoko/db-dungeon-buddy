-- Dungeon Buddy — Supabase schema, migration 16 of N: grid and measuring
-- on scenes (BIBLE.md §8 Phase 6, step 2). Requires 001-015. Safe to
-- re-run.
--
--   - scenes gains a grid: grid_size (one square's width as a fraction
--     of the picture's width; null = no grid) and grid_feet (what one
--     square is worth, usually 5 ft). Squares are square, so their height
--     follows from the picture's shape.
--   - The DM's measuring line is never stored: it's broadcast live on a
--     private Realtime channel "scene:<campaign id>". Members may listen;
--     only the DM may send.

alter table scenes
  add column if not exists grid_size real,
  add column if not exists grid_feet smallint not null default 5;

alter table scenes drop constraint if exists scenes_grid_size_check;
alter table scenes add constraint scenes_grid_size_check check (grid_size is null or grid_size between 0.01 and 0.5);
alter table scenes drop constraint if exists scenes_grid_feet_check;
alter table scenes add constraint scenes_grid_feet_check check (grid_feet between 1 and 100);

create or replace function scene_topic_campaign(p_topic text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
declare
  v_id text := substring(p_topic from '^scene:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$');
begin
  return v_id::uuid;
end;
$$;

revoke all on function scene_topic_campaign(text) from public;
grant execute on function scene_topic_campaign(text) to authenticated;

-- Guarded like 008's presence policies, so this file still runs on a
-- Postgres without Supabase Realtime (e.g. a local test database).
do $$
begin
  if to_regclass('realtime.messages') is not null and to_regprocedure('realtime.topic()') is not null then
    execute 'drop policy if exists "campaign members hear the scene" on realtime.messages';
    execute $p$
      create policy "campaign members hear the scene" on realtime.messages
        for select to authenticated
        using (
          realtime.messages.extension = 'broadcast'
          and public.is_campaign_member(public.scene_topic_campaign(realtime.topic()), auth.uid())
        )
    $p$;
    execute 'drop policy if exists "the dm broadcasts to the scene" on realtime.messages';
    execute $p$
      create policy "the dm broadcasts to the scene" on realtime.messages
        for insert to authenticated
        with check (
          realtime.messages.extension = 'broadcast'
          and public.is_campaign_dm(public.scene_topic_campaign(realtime.topic()), auth.uid())
        )
    $p$;
  end if;
end;
$$;
