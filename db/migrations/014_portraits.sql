-- Dungeon Buddy — Supabase schema, migration 14 of N: character portraits.
-- Requires 001-013. Safe to re-run.
--
-- A picture per character, kept in Supabase Storage — a private bucket,
-- "portraits". Every file lives under the character it belongs to:
--
--   campaigns/<campaign id>/sheets/<sheet id>/<random>.webp
--   users/<owner id>/roster/<roster character id>/<random>.webp
--
-- and the storage policies below read the path to decide who's allowed:
--
--   - a campaign portrait is seen by the campaign's members, and put up,
--     replaced or taken down by the DM or whoever is wearing the
--     character (the same people who can edit the sheet, 007);
--   - a My Characters portrait is its owner's alone (no anonymous
--     accounts, like the roster itself, 009).
--
-- The bucket isn't public, so the app shows pictures through short-lived
-- signed links, which only a member can get. The app shrinks and crops
-- pictures to 512×512 before upload; the bucket still refuses anything
-- over 1 MB or that isn't an image, and a folder holds at most three
-- files (the app deletes the old picture when you replace it).
--
-- Deleting a character, or a campaign, doesn't delete its pictures from
-- storage (Supabase doesn't let SQL delete storage files): the app does
-- that when a character is deleted; a deleted campaign's pictures can
-- no longer be seen by anyone and can be cleared out in the Storage
-- dashboard.

-- ---------------------------------------------------------------------
-- 1. Which picture a character has.
-- ---------------------------------------------------------------------
alter table character_sheets add column if not exists portrait_path text;
alter table roster_characters add column if not exists portrait_path text;

-- A character can only point at a file in its own folder.
alter table character_sheets drop constraint if exists character_sheets_portrait_path_check;
alter table character_sheets add constraint character_sheets_portrait_path_check check (
  portrait_path is null
  or (char_length(portrait_path) <= 300
      and starts_with(portrait_path, 'campaigns/' || campaign_id || '/sheets/' || id || '/'))
);

alter table roster_characters drop constraint if exists roster_characters_portrait_path_check;
alter table roster_characters add constraint roster_characters_portrait_path_check check (
  portrait_path is null
  or (char_length(portrait_path) <= 300
      and starts_with(portrait_path, 'users/' || owner_id || '/roster/' || id || '/'))
);

-- ---------------------------------------------------------------------
-- 2. The bucket.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portraits', 'portraits', false, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------
-- 3. Reading the path. security definer so they can look at campaigns,
--    sheets and the roster without those tables' own RLS getting in the
--    way; they only ever answer yes or no.
-- ---------------------------------------------------------------------
create or replace function portrait_can_read(p_name text)
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
  if auth.uid() is null or coalesce(array_length(parts, 1), 0) <> 5 then
    return false;
  end if;
  if parts[1] = 'campaigns' and parts[2] ~ uuid_re then
    return is_campaign_member(parts[2]::uuid, auth.uid());
  end if;
  if parts[1] = 'users' then
    return parts[2] = auth.uid()::text;
  end if;
  return false;
end;
$$;

create or replace function portrait_can_write(p_name text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  parts text[] := string_to_array(p_name, '/');
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  me uuid := auth.uid();
begin
  if me is null
     or coalesce(array_length(parts, 1), 0) <> 5
     or parts[2] !~ uuid_re
     or parts[4] !~ uuid_re
     or parts[5] !~ '^[a-z0-9-]{8,64}\.(webp|jpg|png)$' then
    return false;
  end if;

  if parts[1] = 'campaigns' and parts[3] = 'sheets' then
    return exists (
      select 1 from character_sheets s
      where s.id = parts[4]::uuid
        and s.campaign_id = parts[2]::uuid
        and (
          is_campaign_dm(s.campaign_id, me)
          or (s.player_id = me and is_campaign_member(s.campaign_id, me))
        )
    );
  end if;

  if parts[1] = 'users' and parts[3] = 'roster' then
    return parts[2] = me::text
      and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
      and exists (select 1 from roster_characters r where r.id = parts[4]::uuid and r.owner_id = me);
  end if;

  return false;
end;
$$;

-- How many files are already in this picture's folder. Runs as the
-- caller (not security definer), so it only counts what they can see —
-- which, for a folder they can write to, is all of it.
create or replace function portrait_folder_count(p_name text)
returns bigint
language sql
stable
set search_path = public
as $$
  select count(*)
  from storage.objects
  where bucket_id = 'portraits'
    and starts_with(name, array_to_string((string_to_array(p_name, '/'))[1:4], '/') || '/');
$$;

revoke all on function portrait_can_read(text) from public;
revoke all on function portrait_can_write(text) from public;
revoke all on function portrait_folder_count(text) from public;
grant execute on function portrait_can_read(text) to authenticated;
grant execute on function portrait_can_write(text) to authenticated;
grant execute on function portrait_folder_count(text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Storage policies. RLS is already on for storage.objects.
-- ---------------------------------------------------------------------
drop policy if exists "portraits: members see them" on storage.objects;
create policy "portraits: members see them" on storage.objects
  for select to authenticated
  using (bucket_id = 'portraits' and public.portrait_can_read(name));

drop policy if exists "portraits: editors upload" on storage.objects;
create policy "portraits: editors upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'portraits'
    and public.portrait_can_write(name)
    and public.portrait_folder_count(name) < 3
  );

drop policy if exists "portraits: editors replace" on storage.objects;
create policy "portraits: editors replace" on storage.objects
  for update to authenticated
  using (bucket_id = 'portraits' and public.portrait_can_write(name))
  with check (bucket_id = 'portraits' and public.portrait_can_write(name));

drop policy if exists "portraits: editors delete" on storage.objects;
create policy "portraits: editors delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'portraits' and public.portrait_can_write(name));
