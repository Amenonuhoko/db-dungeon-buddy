-- Dungeon Buddy — Supabase schema, migration 19 of N: fog of war, map
-- markers and spell areas (BIBLE.md §7, Scenes). Requires 001-018. Safe
-- to re-run.
--
--   - scenes.fog: { on, strokes: [{ m: 'r'|'h', w, p: [x0, y0, x1, y1, …] }] }
--     — the DM's painting, in order: 'r' reveals, 'h' hides again. Points
--     are 0–1000 across the picture's width and height; w is the brush
--     width in thousandths of the width. Players see the fogged parts as
--     darkness; their own tokens stay visible.
--   - scene_marks: things drawn on the map — a door, a trap, loot, a
--     label, or a spell area (circle, square, cone, line) sized in feet.
--     `dm_only` hides one from players until revealed (the trap nobody's
--     found yet), exactly like scene_tokens.

alter table scenes add column if not exists fog jsonb;

alter table scenes drop constraint if exists scenes_fog_check;
alter table scenes add constraint scenes_fog_check check (
  fog is null or (jsonb_typeof(fog) = 'object' and octet_length(fog::text) <= 400000)
);

create table if not exists scene_marks (
  id          uuid primary key default gen_random_uuid(),
  scene_id    uuid not null references scenes (id) on delete cascade,
  campaign_id uuid not null references campaigns (id) on delete cascade,
  kind        text not null check (kind in ('door', 'trap', 'loot', 'label', 'circle', 'square', 'cone', 'line')),
  x           real not null check (x between 0 and 1),
  y           real not null check (y between 0 and 1),
  angle       real not null default 0 check (angle between -360 and 360),
  size_ft     smallint not null default 5 check (size_ft between 5 and 500),
  label       text check (label is null or char_length(label) between 1 and 120),
  color       text check (color is null or color ~ '^[a-z]{1,20}$'),
  dm_only     boolean not null default false,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists scene_marks_scene_idx on scene_marks (scene_id);
create index if not exists scene_marks_campaign_idx on scene_marks (campaign_id);

create or replace function scene_marks_inherit_campaign()
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
  return new;
end;
$$;

drop trigger if exists a_scene_marks_inherit_campaign on scene_marks;
create trigger a_scene_marks_inherit_campaign
  before insert or update on scene_marks
  for each row execute function scene_marks_inherit_campaign();

drop trigger if exists scene_marks_stamp_created_by on scene_marks;
create trigger scene_marks_stamp_created_by
  before insert on scene_marks
  for each row execute function stamp_created_by();

drop trigger if exists scene_marks_touch_updated_at on scene_marks;
create trigger scene_marks_touch_updated_at
  before update on scene_marks
  for each row execute function touch_updated_at();

drop trigger if exists zz_scene_marks_keep_identity on scene_marks;
create trigger zz_scene_marks_keep_identity
  before update on scene_marks
  for each row execute function keep_row_identity();

alter table scene_marks enable row level security;

drop policy if exists "scene marks: dm sees all, members see the live scene's" on scene_marks;
create policy "scene marks: dm sees all, members see the live scene's" on scene_marks
  for select using (
    is_campaign_dm(campaign_id, auth.uid())
    or (
      not dm_only
      and is_campaign_member(campaign_id, auth.uid())
      and exists (select 1 from scenes s where s.id = scene_id and s.active)
    )
  );

drop policy if exists "scene marks: only dm writes" on scene_marks;
create policy "scene marks: only dm writes" on scene_marks
  for all using (is_campaign_dm(campaign_id, auth.uid())) with check (is_campaign_dm(campaign_id, auth.uid()));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'scene_marks'
  ) then
    execute 'alter publication supabase_realtime add table public.scene_marks';
  end if;
end;
$$;
