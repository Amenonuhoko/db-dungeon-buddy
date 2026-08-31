-- Codex — Supabase schema, migration 2 of N: world-building content
-- (encyclopedia, bestiary, notes). Requires 001_core.sql to have already
-- been run (uses is_campaign_member() and the campaigns/campaign_members
-- tables it defines). Safe to re-run — see that file's header.

-- Shared trigger helpers — never trust the client for these columns,
-- same doctrine as little-bonfire's reset_server_columns: a crafted
-- payload can't claim someone else's authorship or backdate an edit.
create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function stamp_created_by()
returns trigger
language plpgsql
as $$
begin
  new.created_by := auth.uid();
  return new;
end;
$$;

create or replace function stamp_author_id()
returns trigger
language plpgsql
as $$
begin
  new.author_id := auth.uid();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- encyclopedia_entries — DM-authored world reference, readable by the
-- whole campaign. `search_vector` backs full-text search server-side;
-- the app's own search box currently just filters the loaded list
-- client-side (campaign content is small), so this is here for when
-- that stops being true rather than being used today.
-- ---------------------------------------------------------------------
create table if not exists encyclopedia_entries (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  category    text not null check (category in ('location', 'npc', 'faction', 'item', 'lore', 'other')),
  title       text not null check (char_length(title) between 1 and 160),
  body        text not null default '',
  tags        text[] not null default '{}',
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'B')
  ) stored
);

create index if not exists encyclopedia_campaign_idx on encyclopedia_entries (campaign_id);
create index if not exists encyclopedia_search_idx on encyclopedia_entries using gin (search_vector);

drop trigger if exists encyclopedia_stamp_created_by on encyclopedia_entries;
create trigger encyclopedia_stamp_created_by
  before insert on encyclopedia_entries
  for each row execute function stamp_created_by();

drop trigger if exists encyclopedia_touch_updated_at on encyclopedia_entries;
create trigger encyclopedia_touch_updated_at
  before update on encyclopedia_entries
  for each row execute function touch_updated_at();

alter table encyclopedia_entries enable row level security;

drop policy if exists "encyclopedia viewable by campaign members" on encyclopedia_entries;
create policy "encyclopedia viewable by campaign members" on encyclopedia_entries
  for select using (is_campaign_member(campaign_id, auth.uid()));

drop policy if exists "dm writes encyclopedia" on encyclopedia_entries;
create policy "dm writes encyclopedia" on encyclopedia_entries
  for all using (
    exists (select 1 from campaigns c where c.id = campaign_id and c.dm_id = auth.uid())
  ) with check (
    exists (select 1 from campaigns c where c.id = campaign_id and c.dm_id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- bestiary_entries — DM-authored stat blocks. `abilities` is a small
-- jsonb blob ({str,dex,con,int,wis,cha}) rather than six columns so a
-- homebrew ruleset can stash extra keys without a schema change later.
-- ---------------------------------------------------------------------
create table if not exists bestiary_entries (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references campaigns (id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 160),
  type            text not null default '',
  size            text not null default 'Medium',
  armor_class     integer,
  hit_points      integer,
  hit_dice        text not null default '',
  speed           text not null default '',
  abilities       jsonb not null default '{"str":10,"dex":10,"con":10,"int":10,"wis":10,"cha":10}',
  challenge_rating text not null default '',
  traits          text not null default '',
  actions         text not null default '',
  notes           text not null default '',
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(type, '') || ' ' || coalesce(traits, '') || ' ' || coalesce(actions, '')), 'B')
  ) stored
);

create index if not exists bestiary_campaign_idx on bestiary_entries (campaign_id);
create index if not exists bestiary_search_idx on bestiary_entries using gin (search_vector);

drop trigger if exists bestiary_stamp_created_by on bestiary_entries;
create trigger bestiary_stamp_created_by
  before insert on bestiary_entries
  for each row execute function stamp_created_by();

drop trigger if exists bestiary_touch_updated_at on bestiary_entries;
create trigger bestiary_touch_updated_at
  before update on bestiary_entries
  for each row execute function touch_updated_at();

alter table bestiary_entries enable row level security;

drop policy if exists "bestiary viewable by campaign members" on bestiary_entries;
create policy "bestiary viewable by campaign members" on bestiary_entries
  for select using (is_campaign_member(campaign_id, auth.uid()));

drop policy if exists "dm writes bestiary" on bestiary_entries;
create policy "dm writes bestiary" on bestiary_entries
  for all using (
    exists (select 1 from campaigns c where c.id = campaign_id and c.dm_id = auth.uid())
  ) with check (
    exists (select 1 from campaigns c where c.id = campaign_id and c.dm_id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- notes — freeform, owned by whoever wrote them. `visibility` controls
-- who besides the author can read a row: 'private' (default, author
-- only), 'dm' (author + that campaign's DM), or 'campaign' (every
-- member). Nothing but the author can ever write to their own note.
-- ---------------------------------------------------------------------
create table if not exists notes (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  author_id   uuid not null references auth.users (id) on delete cascade,
  visibility  text not null default 'private' check (visibility in ('private', 'dm', 'campaign')),
  title       text not null check (char_length(title) between 1 and 160),
  body        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists notes_campaign_idx on notes (campaign_id);
create index if not exists notes_author_idx on notes (author_id);

drop trigger if exists notes_stamp_author_id on notes;
create trigger notes_stamp_author_id
  before insert on notes
  for each row execute function stamp_author_id();

drop trigger if exists notes_touch_updated_at on notes;
create trigger notes_touch_updated_at
  before update on notes
  for each row execute function touch_updated_at();

alter table notes enable row level security;

drop policy if exists "notes viewable by author, or per visibility" on notes;
create policy "notes viewable by author, or per visibility" on notes
  for select using (
    author_id = auth.uid()
    or (visibility = 'campaign' and is_campaign_member(campaign_id, auth.uid()))
    or (
      visibility = 'dm'
      and exists (select 1 from campaigns c where c.id = campaign_id and c.dm_id = auth.uid())
    )
  );

drop policy if exists "campaign members create their own notes" on notes;
create policy "campaign members create their own notes" on notes
  for insert with check (is_campaign_member(campaign_id, auth.uid()));

drop policy if exists "authors edit their own notes" on notes;
create policy "authors edit their own notes" on notes
  for update using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists "authors delete their own notes" on notes;
create policy "authors delete their own notes" on notes
  for delete using (author_id = auth.uid());
