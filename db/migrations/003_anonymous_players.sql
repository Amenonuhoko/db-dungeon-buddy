-- Codex — Supabase schema, migration 3 of N: anonymous player join.
--
-- Enables the "join a campaign as a player, no account needed" flow —
-- BIBLE.md §4. Requires 001_core.sql and 002_world_building.sql to have
-- already been run. Also requires turning on **Anonymous sign-ins**
-- under your Supabase project's Authentication → Sign In / Providers
-- settings — that toggle isn't something SQL can flip, do it in the
-- dashboard. Safe to re-run.
--
-- This file only patches handle_new_user() — nothing else in the schema
-- needs to change. Row Level Security already keys everything off
-- auth.uid(), and an anonymous session has a real one just like a full
-- account does, so campaigns/campaign_members/encyclopedia_entries/
-- bestiary_entries/notes all work unchanged for anonymous players.
--
-- If you ran 001_core.sql before this file existed, your handle_new_user
-- would fail to sign up an anonymous user: it fell back to
-- split_part(new.email, '@', 1) for a missing display name, and an
-- anonymous user has no email at all, so that fallback resolves to null
-- and trips profiles.display_name's not-null check. This re-creates the
-- function with a final 'Traveler' fallback. A fresh run of
-- 001_core.sql already includes this fix, so this file is a no-op on a
-- database that hasn't run the old version.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), 'Traveler')
  );
  return new;
end;
$$;
