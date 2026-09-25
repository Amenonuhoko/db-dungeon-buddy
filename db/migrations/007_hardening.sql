-- Dungeon Buddy — Supabase schema, migration 7 of N: hardening. Requires
-- 001-006. Safe to re-run.
--
-- Anyone holding an invite link can become a real, authenticated member
-- in one click (an anonymous sign-in — BIBLE.md §4), so the policies
-- have to hold up against a member calling the API directly, not just
-- against what the app's own screens happen to send. A review of
-- 001-006 with that in mind found these gaps, each confirmed against a
-- real Postgres before being fixed here (BIBLE.md §5 lists them):
--
--   1. Rows could be moved between campaigns on update. A player could
--      move their note (or, in both campaigns, their sheet) into
--      another campaign; created_by/created_at could be rewritten.
--   2. Child rows trusted a client-supplied campaign_id. A DM of any
--      campaign could put a condition on a character sheet in someone
--      else's campaign, or add another campaign's character to their
--      own encounter, just by claiming their own campaign_id.
--   3. Kicking a player didn't take anything away. They could still
--      edit their sheet, set their initiative, and edit their notes.
--   4. A DM could delete their own DM membership row, leaving a campaign
--      they own but can't open.
--   5. Anonymous users could create campaigns (the app hides the button,
--      the API didn't care) — campaigns that are lost with their session.
--   6. The dice log trusted the client's display_name, so anyone could
--      post a roll as "DM"; roll payloads and every text column were
--      unbounded, and the roll log grew forever.
--   7. The DM could hand a sheet to someone who isn't in the campaign.
--   8. encounters.current_combatant_id could point anywhere.
--
-- Plus, for the core experience: players may now create their own
-- character (they previously had to wait for the DM), DMs can reset a
-- leaked invite link, invite codes are matched case-insensitively, and
-- membership changes are broadcast live (a DM sees players join without
-- reloading).
--
-- Size limits are added NOT VALID: enforced on every new write, without
-- failing this migration over any existing row that's already larger.

-- ---------------------------------------------------------------------
-- 0. Pin search_path on the 002 trigger helpers (Supabase's linter flags
--    a mutable search_path on any function).
-- ---------------------------------------------------------------------
alter function touch_updated_at() set search_path = public;
alter function stamp_created_by() set search_path = public;
alter function stamp_author_id() set search_path = public;

-- Display names from sign-up metadata are client-supplied: trim them,
-- cap them at the column's 60 characters, and fall back rather than
-- fail the whole sign-up on an empty or oversized one.
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
    left(
      coalesce(
        nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
        nullif(split_part(new.email, '@', 1), ''),
        'Traveler'
      ),
      60
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. Row identity is fixed once written. Runs as the last BEFORE UPDATE
--    trigger on each table (triggers fire in name order — hence "zz_"),
--    so it also sees any campaign_id a parent-lookup trigger derived.
-- ---------------------------------------------------------------------
create or replace function keep_row_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.campaign_id is distinct from old.campaign_id then
    raise exception 'This can''t be moved to another campaign' using errcode = '42501';
  end if;
  new.id := old.id;
  new.created_at := old.created_at;
  return new;
end;
$$;

create or replace function keep_created_by()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.created_by := old.created_by;
  return new;
end;
$$;

create or replace function keep_author_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.author_id := old.author_id;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'encyclopedia_entries', 'bestiary_entries', 'notes', 'character_sheets',
    'character_conditions', 'encounters', 'encounter_combatants', 'dice_rolls'
  ]
  loop
    execute format('drop trigger if exists zz_%1$s_keep_identity on %1$I', t);
    execute format(
      'create trigger zz_%1$s_keep_identity before update on %1$I for each row execute function keep_row_identity()', t);
    if t = 'notes' then
      execute format('drop trigger if exists zz_%1$s_keep_author on %1$I', t);
      execute format(
        'create trigger zz_%1$s_keep_author before update on %1$I for each row execute function keep_author_id()', t);
    else
      execute format('drop trigger if exists zz_%1$s_keep_created_by on %1$I', t);
      execute format(
        'create trigger zz_%1$s_keep_created_by before update on %1$I for each row execute function keep_created_by()', t);
    end if;
  end loop;
end;
$$;

-- campaigns: the owner and creation time never change either. (The
-- update policy already pins dm_id to the caller.)
create or replace function keep_campaign_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.id := old.id;
  new.dm_id := old.dm_id;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists zz_campaigns_keep_identity on campaigns;
create trigger zz_campaigns_keep_identity
  before update on campaigns
  for each row execute function keep_campaign_identity();

-- ---------------------------------------------------------------------
-- 2. Child rows take campaign_id from their parent, never the client.
--    security definer so the lookup sees the parent even when the caller
--    can't; the table's own RLS WITH CHECK then runs against the real
--    campaign, so "DM of B" no longer passes for a row that lives in A.
-- ---------------------------------------------------------------------
create or replace function conditions_inherit_campaign()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign uuid;
begin
  select campaign_id into v_campaign from character_sheets where id = new.character_id;
  if v_campaign is null then
    raise exception 'That character doesn''t exist' using errcode = '23503';
  end if;
  new.campaign_id := v_campaign;
  return new;
end;
$$;

drop trigger if exists a_character_conditions_inherit_campaign on character_conditions;
create trigger a_character_conditions_inherit_campaign
  before insert or update on character_conditions
  for each row execute function conditions_inherit_campaign();

create or replace function combatants_inherit_campaign()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign uuid;
begin
  select campaign_id into v_campaign from encounters where id = new.encounter_id;
  if v_campaign is null then
    raise exception 'That encounter doesn''t exist' using errcode = '23503';
  end if;
  new.campaign_id := v_campaign;
  if new.character_id is not null and not exists (
    select 1 from character_sheets where id = new.character_id and campaign_id = v_campaign
  ) then
    raise exception 'That character isn''t in this campaign' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists a_encounter_combatants_inherit_campaign on encounter_combatants;
create trigger a_encounter_combatants_inherit_campaign
  before insert or update on encounter_combatants
  for each row execute function combatants_inherit_campaign();

-- Whose turn it is has to be someone in this encounter (or nobody).
create or replace function check_current_combatant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.current_combatant_id is not null and not exists (
    select 1 from encounter_combatants where id = new.current_combatant_id and encounter_id = new.id
  ) then
    raise exception 'That combatant isn''t in this encounter' using errcode = '23503';
  end if;
  return new;
end;
$$;

drop trigger if exists a_encounters_check_current_combatant on encounters;
create trigger a_encounters_check_current_combatant
  before insert or update of current_combatant_id on encounters
  for each row execute function check_current_combatant();

-- A sheet belongs to someone actually in the campaign. Only checked when
-- player_id is set or changed — a player who has since been removed
-- keeps their sheet, and the DM can still edit it.
create or replace function check_sheet_player()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT' or new.player_id is distinct from old.player_id)
     and not is_campaign_member(new.campaign_id, new.player_id) then
    raise exception 'That player isn''t in this campaign' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists a_character_sheets_check_player on character_sheets;
create trigger a_character_sheets_check_player
  before insert or update on character_sheets
  for each row execute function check_sheet_player();

-- ---------------------------------------------------------------------
-- 3. A player's rights over their own things end when they leave the
--    campaign (or the DM removes them).
-- ---------------------------------------------------------------------

-- Players can now make their own character — they no longer have to
-- wait for the DM to hand one out. Only ever for themselves.
drop policy if exists "dm creates a sheet" on character_sheets;
drop policy if exists "dm or member creates a sheet" on character_sheets;
create policy "dm or member creates a sheet" on character_sheets
  for insert with check (
    is_campaign_dm(campaign_id, auth.uid())
    or (player_id = auth.uid() and is_campaign_member(campaign_id, auth.uid()))
  );

drop policy if exists "dm or owner updates a sheet" on character_sheets;
create policy "dm or owner updates a sheet" on character_sheets
  for update using (
    is_campaign_dm(campaign_id, auth.uid())
    or (player_id = auth.uid() and is_campaign_member(campaign_id, auth.uid()))
  ) with check (
    is_campaign_dm(campaign_id, auth.uid())
    or (player_id = auth.uid() and is_campaign_member(campaign_id, auth.uid()))
  );

drop policy if exists "dm or owner deletes a sheet" on character_sheets;
create policy "dm or owner deletes a sheet" on character_sheets
  for delete using (
    is_campaign_dm(campaign_id, auth.uid())
    or (player_id = auth.uid() and is_campaign_member(campaign_id, auth.uid()))
  );

drop policy if exists "conditions viewable by dm, owner, or party if visible" on character_conditions;
create policy "conditions viewable by dm, owner, or party if visible" on character_conditions
  for select using (
    is_campaign_dm(campaign_id, auth.uid())
    or (
      is_campaign_member(campaign_id, auth.uid())
      and (
        visible_to_party
        or exists (
          select 1 from character_sheets cs
          where cs.id = character_conditions.character_id and cs.player_id = auth.uid()
        )
      )
    )
  );

-- Authors can still read and delete their own notes after leaving (it's
-- their writing), but can't keep editing what the table sees.
drop policy if exists "authors edit their own notes" on notes;
create policy "authors edit their own notes" on notes
  for update using (
    author_id = auth.uid() and is_campaign_member(campaign_id, auth.uid())
  ) with check (
    author_id = auth.uid() and is_campaign_member(campaign_id, auth.uid())
  );

create or replace function set_my_initiative(p_combatant_id uuid, p_initiative integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_initiative is null or p_initiative < -10 or p_initiative > 60 then
    raise exception 'Initiative must be a number between -10 and 60';
  end if;

  update encounter_combatants c
  set initiative = p_initiative
  where c.id = p_combatant_id
    and c.is_pc
    and is_campaign_member(c.campaign_id, auth.uid())
    and exists (
      select 1 from character_sheets cs
      where cs.id = c.character_id and cs.player_id = auth.uid()
    );

  if not found then
    raise exception 'You can only roll initiative for your own character';
  end if;
end;
$$;

revoke all on function set_my_initiative(uuid, integer) from public;
grant execute on function set_my_initiative(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Membership: players leave, the DM removes players, and nobody
--    removes the DM's own row (deleting the campaign cascades it away).
-- ---------------------------------------------------------------------
drop policy if exists "leave campaign or dm removes a member" on campaign_members;
create policy "leave campaign or dm removes a member" on campaign_members
  for delete using (
    role <> 'dm'
    and (user_id = auth.uid() or is_campaign_dm(campaign_id, auth.uid()))
  );

-- ---------------------------------------------------------------------
-- 5. Only real (non-anonymous) accounts create campaigns. A restrictive
--    policy is ANDed with every permissive one, so this can't be
--    widened by accident later.
-- ---------------------------------------------------------------------
drop policy if exists "anonymous users can't create campaigns" on campaigns;
create policy "anonymous users can't create campaigns" on campaigns
  as restrictive
  for insert
  with check (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

-- ---------------------------------------------------------------------
-- 6. Invites: case/space-insensitive codes, a sane size cap per table,
--    and a way to retire a leaked link.
-- ---------------------------------------------------------------------
alter table campaigns drop constraint if exists campaigns_invite_code_format;
alter table campaigns add constraint campaigns_invite_code_format
  check (invite_code ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(invite_code) between 8 and 40) not valid;

create or replace function join_campaign_with_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_id uuid;
  v_code text := lower(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
begin
  if auth.uid() is null then
    raise exception 'Sign in before joining a campaign';
  end if;

  select id into v_campaign_id from campaigns where invite_code = v_code;
  if v_campaign_id is null then
    raise exception 'Invalid invite code';
  end if;

  if not is_campaign_member(v_campaign_id, auth.uid())
     and (select count(*) from campaign_members where campaign_id = v_campaign_id) >= 50 then
    raise exception 'This campaign is full';
  end if;

  insert into campaign_members (campaign_id, user_id, role)
  values (v_campaign_id, auth.uid(), 'player')
  on conflict (campaign_id, user_id) do nothing;

  return v_campaign_id;
end;
$$;

revoke all on function join_campaign_with_code(text) from public;
grant execute on function join_campaign_with_code(text) to authenticated;

-- gen_random_uuid() is core Postgres (13+), unlike pgcrypto's
-- gen_random_bytes, which Supabase keeps in the "extensions" schema.
create or replace function regenerate_invite_code(p_campaign_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if not is_campaign_dm(p_campaign_id, auth.uid()) then
    raise exception 'Only the DM can reset the invite link';
  end if;
  loop
    v_code := left(replace(gen_random_uuid()::text, '-', ''), 10);
    begin
      update campaigns set invite_code = v_code where id = p_campaign_id;
      return v_code;
    exception when unique_violation then
      -- vanishingly rare; try another
    end;
  end loop;
end;
$$;

revoke all on function regenerate_invite_code(uuid) from public;
grant execute on function regenerate_invite_code(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 7. The dice log: names come from the roller's profile, payloads are
--    bounded, and only the newest 200 rolls per campaign are kept.
-- ---------------------------------------------------------------------
create or replace function stamp_roll_display_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.display_name := coalesce((select display_name from profiles where id = auth.uid()), 'Someone');
  return new;
end;
$$;

drop trigger if exists dice_rolls_stamp_display_name on dice_rolls;
create trigger dice_rolls_stamp_display_name
  before insert on dice_rolls
  for each row execute function stamp_roll_display_name();

create or replace function prune_dice_rolls()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from dice_rolls
  where campaign_id = new.campaign_id
    and id in (
      select id from dice_rolls
      where campaign_id = new.campaign_id
      order by created_at desc
      offset 200
    );
  return null;
end;
$$;

drop trigger if exists dice_rolls_prune on dice_rolls;
create trigger dice_rolls_prune
  after insert on dice_rolls
  for each row execute function prune_dice_rolls();

-- ---------------------------------------------------------------------
-- 8. Size limits on everything a member can write. Generous — far past
--    anything the app's own forms produce — just not unbounded.
-- ---------------------------------------------------------------------
do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('campaigns',            'campaigns_description_len',          'char_length(description) <= 2000'),
      ('encyclopedia_entries', 'encyclopedia_body_len',              'char_length(body) <= 50000'),
      ('encyclopedia_entries', 'encyclopedia_tags_len',              'cardinality(tags) <= 30'),
      ('bestiary_entries',     'bestiary_short_fields_len',          'char_length(type) <= 200 and char_length(size) <= 200 and char_length(hit_dice) <= 200 and char_length(speed) <= 200 and char_length(challenge_rating) <= 200'),
      ('bestiary_entries',     'bestiary_long_fields_len',           'char_length(traits) <= 20000 and char_length(actions) <= 20000 and char_length(notes) <= 20000'),
      ('bestiary_entries',     'bestiary_abilities_size',            'octet_length(abilities::text) <= 2000'),
      ('notes',                'notes_body_len',                     'char_length(body) <= 50000'),
      ('character_sheets',     'character_sheets_short_fields_len',  'char_length(class_and_level) <= 200 and char_length(race) <= 200 and char_length(background) <= 200 and char_length(speed) <= 200'),
      ('character_sheets',     'character_sheets_long_fields_len',   'char_length(equipment) <= 20000 and char_length(features) <= 20000'),
      ('character_sheets',     'character_sheets_abilities_size',    'octet_length(abilities::text) <= 2000'),
      ('character_sheets',     'character_sheets_resources_shape',   'jsonb_typeof(resources) = ''array'' and jsonb_array_length(resources) <= 50 and octet_length(resources::text) <= 20000'),
      ('character_conditions', 'character_conditions_note_len',      'char_length(note) <= 2000'),
      ('encounter_combatants', 'encounter_combatants_conditions_len','cardinality(conditions) <= 30'),
      ('dice_rolls',           'dice_rolls_rolls_shape',             'jsonb_typeof(rolls) = ''array'' and jsonb_array_length(rolls) <= 100'),
      ('dice_rolls',           'dice_rolls_total_range',             'total between -1000000 and 1000000')
    ) as v(tbl, name, expr)
  loop
    execute format('alter table %I drop constraint if exists %I', c.tbl, c.name);
    -- A later migration can move a column elsewhere (010 moves a sheet's
    -- private fields to character_details, which carries its own
    -- limits) — re-running this file afterwards just skips that check.
    begin
      execute format('alter table %I add constraint %I check (%s) not valid', c.tbl, c.name, c.expr);
    exception when undefined_column then
      null;
    end;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 9. Realtime for membership, so a DM sees players the moment they join
--    (the Party tab and Campaign Settings listen for it) instead of
--    after a reload. Realtime applies campaign_members' select policy per
--    subscriber: members only hear about their own campaigns.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'campaign_members'
  ) then
    alter publication supabase_realtime add table public.campaign_members;
  end if;
end;
$$;
