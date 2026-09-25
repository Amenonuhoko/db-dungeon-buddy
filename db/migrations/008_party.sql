-- Dungeon Buddy — Supabase schema, migration 8 of N: the party page.
-- Requires 001-007 (uses is_campaign_member(), stamp_created_by(),
-- touch_updated_at(), keep_row_identity(), keep_created_by()). Safe to
-- re-run.
--
--   - messages: Table Talk. recipient_id null = the whole table;
--     otherwise a whisper only the sender and recipient can ever read —
--     not the DM, not anyone else. Players pass notes to the DM this way
--     too ("I quietly pocket the gem").
--   - party_items / party_coins: the Party Stash — the loot and coin the
--     party holds in common. Any member can change it (it's the party's,
--     not the DM's); coins only move through adjust_party_coins(), which
--     is atomic and never lets a purse go negative.
--   - Realtime for all three, and access control on the presence channel
--     ("who's at the table right now") so only members can join it.

-- ---------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------
create table if not exists messages (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references campaigns (id) on delete cascade,
  sender_id    uuid not null references auth.users (id) on delete cascade,
  recipient_id uuid references auth.users (id) on delete cascade,
  body         text not null check (char_length(body) between 1 and 2000),
  created_at   timestamptz not null default now()
);

create index if not exists messages_campaign_idx on messages (campaign_id, created_at desc);
create index if not exists messages_recipient_idx on messages (recipient_id);

-- Who sent it and when are the server's to say, never the client's.
create or replace function stamp_message()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.sender_id := auth.uid();
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists messages_stamp on messages;
create trigger messages_stamp
  before insert on messages
  for each row execute function stamp_message();

alter table messages enable row level security;

drop policy if exists "members read table talk and their own whispers" on messages;
create policy "members read table talk and their own whispers" on messages
  for select using (
    is_campaign_member(campaign_id, auth.uid())
    and (recipient_id is null or sender_id = auth.uid() or recipient_id = auth.uid())
  );

-- A whisper has to go to someone else who's actually in the campaign.
drop policy if exists "members post to the table or whisper a member" on messages;
create policy "members post to the table or whisper a member" on messages
  for insert with check (
    sender_id = auth.uid()
    and is_campaign_member(campaign_id, auth.uid())
    and (
      recipient_id is null
      or (recipient_id <> auth.uid() and is_campaign_member(campaign_id, recipient_id))
    )
  );

drop policy if exists "senders delete their own messages" on messages;
create policy "senders delete their own messages" on messages
  for delete using (sender_id = auth.uid());

-- No update policy: a message, once sent, is what was said.

-- Keep the newest 1000 per campaign — plenty of scrollback, not forever.
create or replace function prune_messages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from messages
  where campaign_id = new.campaign_id
    and id in (
      select id from messages
      where campaign_id = new.campaign_id
      order by created_at desc
      offset 1000
    );
  return null;
end;
$$;

drop trigger if exists messages_prune on messages;
create trigger messages_prune
  after insert on messages
  for each row execute function prune_messages();

-- ---------------------------------------------------------------------
-- party_items — the shared stash. `carried_by` is free text (a
-- character's name, "the cart", "Party") rather than a foreign key: loot
-- gets handed around constantly, and it may sit with an NPC or a mule.
-- ---------------------------------------------------------------------
create table if not exists party_items (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  quantity    integer not null default 1 check (quantity between 0 and 100000),
  carried_by  text not null default '' check (char_length(carried_by) <= 120),
  note        text not null default '' check (char_length(note) <= 500),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists party_items_campaign_idx on party_items (campaign_id);

drop trigger if exists party_items_stamp_created_by on party_items;
create trigger party_items_stamp_created_by
  before insert on party_items
  for each row execute function stamp_created_by();

drop trigger if exists party_items_touch_updated_at on party_items;
create trigger party_items_touch_updated_at
  before update on party_items
  for each row execute function touch_updated_at();

drop trigger if exists zz_party_items_keep_identity on party_items;
create trigger zz_party_items_keep_identity
  before update on party_items
  for each row execute function keep_row_identity();

drop trigger if exists zz_party_items_keep_created_by on party_items;
create trigger zz_party_items_keep_created_by
  before update on party_items
  for each row execute function keep_created_by();

alter table party_items enable row level security;

drop policy if exists "members share the party stash" on party_items;
create policy "members share the party stash" on party_items
  for all using (is_campaign_member(campaign_id, auth.uid()))
  with check (is_campaign_member(campaign_id, auth.uid()));

-- ---------------------------------------------------------------------
-- party_coins — one purse per campaign, in the five D&D denominations.
-- Readable by members; written only through adjust_party_coins().
-- ---------------------------------------------------------------------
create table if not exists party_coins (
  campaign_id uuid primary key references campaigns (id) on delete cascade,
  pp          integer not null default 0 check (pp between 0 and 1000000000),
  gp          integer not null default 0 check (gp between 0 and 1000000000),
  ep          integer not null default 0 check (ep between 0 and 1000000000),
  sp          integer not null default 0 check (sp between 0 and 1000000000),
  cp          integer not null default 0 check (cp between 0 and 1000000000),
  updated_by  uuid references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now()
);

alter table party_coins enable row level security;

drop policy if exists "members see the party purse" on party_coins;
create policy "members see the party purse" on party_coins
  for select using (is_campaign_member(campaign_id, auth.uid()));

-- Add (positive) or spend (negative) coins of one denomination. Atomic —
-- two players spending at once can't both spend the same gold — and it
-- refuses to take the purse below zero.
create or replace function adjust_party_coins(p_campaign_id uuid, p_coin text, p_delta integer)
returns party_coins
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row party_coins;
begin
  if not is_campaign_member(p_campaign_id, auth.uid()) then
    raise exception 'Only members of this campaign can touch its purse';
  end if;
  if p_coin not in ('pp', 'gp', 'ep', 'sp', 'cp') then
    raise exception 'Unknown coin';
  end if;
  if p_delta is null or p_delta = 0 or abs(p_delta) > 10000000 then
    raise exception 'Enter an amount between 1 and 10,000,000';
  end if;

  insert into party_coins (campaign_id) values (p_campaign_id) on conflict (campaign_id) do nothing;

  update party_coins set
    pp = pp + case when p_coin = 'pp' then p_delta else 0 end,
    gp = gp + case when p_coin = 'gp' then p_delta else 0 end,
    ep = ep + case when p_coin = 'ep' then p_delta else 0 end,
    sp = sp + case when p_coin = 'sp' then p_delta else 0 end,
    cp = cp + case when p_coin = 'cp' then p_delta else 0 end,
    updated_by = auth.uid(),
    updated_at = now()
  where campaign_id = p_campaign_id
  returning * into v_row;

  return v_row;
exception
  when check_violation then
    raise exception 'The party doesn''t have that much %', p_coin;
end;
$$;

revoke all on function adjust_party_coins(uuid, text, integer) from public;
grant execute on function adjust_party_coins(uuid, text, integer) to authenticated;

-- ---------------------------------------------------------------------
-- Realtime for the three new tables (RLS applies per subscriber, so a
-- whisper is only ever delivered to its sender and recipient).
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['messages', 'party_items', 'party_coins']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Presence ("who's at the table right now") runs on a private Realtime
-- channel named "presence:<campaign id>". Supabase checks private
-- channels against RLS on realtime.messages: these two policies let a
-- campaign's members — and only them — read and publish presence on
-- their own campaign's channel. Guarded so this file still runs on a
-- Postgres without Supabase Realtime (e.g. a local test database).
-- ---------------------------------------------------------------------
create or replace function presence_topic_member(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id text := substring(p_topic from '^presence:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$');
begin
  if v_id is null then
    return false;
  end if;
  return is_campaign_member(v_id::uuid, auth.uid());
end;
$$;

revoke all on function presence_topic_member(text) from public;
grant execute on function presence_topic_member(text) to authenticated;

do $$
begin
  if to_regclass('realtime.messages') is not null and to_regprocedure('realtime.topic()') is not null then
    execute 'drop policy if exists "campaign members read presence" on realtime.messages';
    execute $p$
      create policy "campaign members read presence" on realtime.messages
        for select to authenticated
        using (realtime.messages.extension = 'presence' and public.presence_topic_member(realtime.topic()))
    $p$;
    execute 'drop policy if exists "campaign members publish presence" on realtime.messages';
    execute $p$
      create policy "campaign members publish presence" on realtime.messages
        for insert to authenticated
        with check (realtime.messages.extension = 'presence' and public.presence_topic_member(realtime.topic()))
    $p$;
  end if;
end;
$$;
