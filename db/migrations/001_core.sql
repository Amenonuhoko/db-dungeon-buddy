-- Codex — Supabase schema, migration 1 of N: core (profiles, campaigns,
-- membership).
--
-- Run every file under db/migrations/ once, in filename order, in the
-- Supabase SQL editor (Dashboard → SQL Editor → New query) on a fresh
-- project. See BIBLE.md §7 for the wider data-model roadmap — each
-- content type gets its own migration when its screen is built, so the
-- schema fits real UI needs instead of being guessed at up front. Safe
-- to re-run: every statement is idempotent (create-if-not-exists /
-- drop-if-exists first / on conflict).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- profiles — one row per auth.users, created automatically on signup.
-- Guests (BIBLE.md §4) never touch this table at all; it only exists for
-- account users.
-- ---------------------------------------------------------------------
create table if not exists profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  created_at   timestamptz not null default now()
);

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Anonymous sign-ins (see BIBLE.md §4, "join as a player, no account")
  -- have no email at all, so split_part(new.email, ...) alone can return
  -- null and trip the not-null check below — the final fallback catches
  -- that case.
  insert into profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), 'Traveler')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------
-- campaigns / campaign_members
--
-- A campaign always has exactly one campaign_members row per
-- participant, the DM included (created automatically below) — there is
-- no special-cased "owner who isn't a member" path, which keeps the RLS
-- policies on both tables symmetric.
-- ---------------------------------------------------------------------
create table if not exists campaigns (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  dm_id       uuid not null references auth.users (id) on delete cascade,
  -- Short, shareable join code. Collision odds at 10 hex chars are
  -- negligible for this app's scale; regenerate by hand in the rare case
  -- a re-run of this script ever hits one.
  invite_code text not null unique default encode(gen_random_bytes(5), 'hex'),
  created_at  timestamptz not null default now()
);

create table if not exists campaign_members (
  campaign_id uuid not null references campaigns (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null check (role in ('dm', 'player')),
  joined_at   timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

create index if not exists campaign_members_user_idx on campaign_members (user_id);

create or replace function create_dm_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into campaign_members (campaign_id, user_id, role)
  values (new.id, new.dm_id, 'dm')
  on conflict (campaign_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_campaign_created on campaigns;
create trigger on_campaign_created
  after insert on campaigns
  for each row execute function create_dm_membership();

-- A player redeems an invite code through this function rather than an
-- insert policy on campaign_members — same "guarded mutation" doctrine
-- as little-bonfire's mark_helped: security definer bypasses RLS for the
-- one thing it's allowed to do (join yourself as a player on the
-- matching campaign), and nothing else.
create or replace function join_campaign_with_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_id uuid;
begin
  select id into v_campaign_id from campaigns where invite_code = p_code;
  if v_campaign_id is null then
    raise exception 'Invalid invite code';
  end if;

  insert into campaign_members (campaign_id, user_id, role)
  values (v_campaign_id, auth.uid(), 'player')
  on conflict (campaign_id, user_id) do nothing;

  return v_campaign_id;
end;
$$;

revoke all on function join_campaign_with_code(text) from public;
grant execute on function join_campaign_with_code(text) to authenticated;

-- Membership check used by the RLS policies below. security definer so
-- it can read campaign_members without triggering that table's own RLS
-- recursively; it only ever returns a boolean, so it leaks nothing.
create or replace function is_campaign_member(p_campaign_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from campaign_members
    where campaign_id = p_campaign_id and user_id = p_user_id
  );
$$;

revoke all on function is_campaign_member(uuid, uuid) from public;
grant execute on function is_campaign_member(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table profiles enable row level security;
alter table campaigns enable row level security;
alter table campaign_members enable row level security;

drop policy if exists "profiles viewable by self and co-members" on profiles;
create policy "profiles viewable by self and co-members" on profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1
      from campaign_members mine
      join campaign_members theirs on theirs.campaign_id = mine.campaign_id
      where mine.user_id = auth.uid() and theirs.user_id = profiles.id
    )
  );

drop policy if exists "users update own profile" on profiles;
create policy "users update own profile" on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- No insert/delete policy on profiles for anon/authenticated — rows are
-- only ever created by handle_new_user() (security definer) and removed
-- via the auth.users cascade.

-- The dm_id = auth.uid() clause isn't redundant with the DM's own
-- campaign_members row below — it's what makes INSERT ... RETURNING
-- (i.e. supabase-js's .insert().select()) work at all. Postgres re-checks
-- the SELECT policy against the just-inserted row to decide whether it
-- can be handed back via RETURNING, and it does this *before* the
-- create_dm_membership() AFTER INSERT trigger below has run — so
-- is_campaign_member() alone would still say "not a member yet" and the
-- insert would fail with the same generic "violates row-level security
-- policy" error, even though the INSERT policy itself passed. The DM
-- should always be able to see their own campaign regardless of trigger
-- timing anyway, so this is the correct fix, not just a workaround.
drop policy if exists "campaigns viewable by members" on campaigns;
create policy "campaigns viewable by members" on campaigns
  for select using (dm_id = auth.uid() or is_campaign_member(id, auth.uid()));

drop policy if exists "dm creates own campaign" on campaigns;
create policy "dm creates own campaign" on campaigns
  for insert with check (dm_id = auth.uid());

drop policy if exists "dm updates own campaign" on campaigns;
create policy "dm updates own campaign" on campaigns
  for update using (dm_id = auth.uid()) with check (dm_id = auth.uid());

drop policy if exists "dm deletes own campaign" on campaigns;
create policy "dm deletes own campaign" on campaigns
  for delete using (dm_id = auth.uid());

drop policy if exists "members viewable by co-members" on campaign_members;
create policy "members viewable by co-members" on campaign_members
  for select using (is_campaign_member(campaign_id, auth.uid()));

drop policy if exists "leave campaign or dm removes a member" on campaign_members;
create policy "leave campaign or dm removes a member" on campaign_members
  for delete using (
    user_id = auth.uid()
    or exists (select 1 from campaigns c where c.id = campaign_members.campaign_id and c.dm_id = auth.uid())
  );

-- No direct insert/update policy on campaign_members — rows are only
-- ever created by create_dm_membership() (on campaign creation) or
-- join_campaign_with_code() (both security definer), and roles never
-- change after joining in this schema version.
