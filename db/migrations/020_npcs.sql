-- Dungeon Buddy — Supabase schema, migration 20 of N: NPCs (BIBLE.md §7,
-- Scenes). Requires 001-019. Safe to re-run.
--
--   - npcs: the campaign's cast — the innkeeper, the guard captain, the
--     scheming noble. An archetype (innkeeper, guard, noble…) gives each
--     an emblem and ready stats; a name, a public one-line look, an
--     attitude towards the party and an optional Bestiary stat block make
--     one expansive when it matters. `met` marks the ones the party has
--     met: players can read only those (their "Who we've met" list).
--   - scene_tokens.npc_id: a named NPC standing on a scene; or just
--     scene_tokens.archetype: a nameless one ("a guard"), standard fare
--     that can become somebody later.

create table if not exists npcs (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  archetype   text not null default 'commoner' check (archetype ~ '^[a-z-]{1,30}$'),
  look        text check (look is null or char_length(look) <= 300),
  attitude    text not null default 'neutral' check (attitude in ('friendly', 'neutral', 'wary', 'hostile')),
  armor_class smallint check (armor_class is null or armor_class between 0 and 40),
  max_hp      integer check (max_hp is null or max_hp between 0 and 2000),
  dex_mod     smallint not null default 0 check (dex_mod between -10 and 15),
  creature_id uuid references bestiary_entries (id) on delete set null,
  met         boolean not null default false,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists npcs_campaign_idx on npcs (campaign_id);

drop trigger if exists b_npcs_check_creature on npcs;
create trigger b_npcs_check_creature
  before insert or update on npcs
  for each row execute function check_creature_campaign();

drop trigger if exists npcs_stamp_created_by on npcs;
create trigger npcs_stamp_created_by
  before insert on npcs
  for each row execute function stamp_created_by();

drop trigger if exists npcs_touch_updated_at on npcs;
create trigger npcs_touch_updated_at
  before update on npcs
  for each row execute function touch_updated_at();

drop trigger if exists zz_npcs_keep_identity on npcs;
create trigger zz_npcs_keep_identity
  before update on npcs
  for each row execute function keep_row_identity();

alter table npcs enable row level security;

-- Players see the NPCs the party has met — nobody else in the cast.
drop policy if exists "npcs: dm sees all, members see who they've met" on npcs;
create policy "npcs: dm sees all, members see who they've met" on npcs
  for select using (
    is_campaign_dm(campaign_id, auth.uid())
    or (met and is_campaign_member(campaign_id, auth.uid()))
  );

drop policy if exists "npcs: only dm writes" on npcs;
create policy "npcs: only dm writes" on npcs
  for all using (is_campaign_dm(campaign_id, auth.uid())) with check (is_campaign_dm(campaign_id, auth.uid()));

-- An NPC on a scene.
alter table scene_tokens
  add column if not exists npc_id uuid references npcs (id) on delete cascade,
  add column if not exists archetype text;

alter table scene_tokens drop constraint if exists scene_tokens_archetype_check;
alter table scene_tokens add constraint scene_tokens_archetype_check check (archetype is null or archetype ~ '^[a-z-]{1,30}$');

create or replace function check_token_npc()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.npc_id is not null and not exists (
    select 1 from npcs where id = new.npc_id and campaign_id = new.campaign_id
  ) then
    raise exception 'That NPC isn''t in this campaign' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists b_scene_tokens_check_npc on scene_tokens;
create trigger b_scene_tokens_check_npc
  before insert or update on scene_tokens
  for each row execute function check_token_npc();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'npcs'
  ) then
    execute 'alter publication supabase_realtime add table public.npcs';
  end if;
end;
$$;
