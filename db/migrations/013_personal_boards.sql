-- Dungeon Buddy — Supabase schema, migration 13 of N: personal boards.
-- Requires 001-012. Safe to re-run.
--
-- A private scratch board per person per campaign, in the Notes tab —
-- for sketching a dungeon layout, doodling the villain, scribbling a
-- clue. Nobody else can see it: not the party, not the DM (and the DM's
-- own board is theirs alone too). It's a drawing, stored as its strokes:
--
--   strokes: [{ c: colour name, w: width, e: 1 if eraser,
--               p: [x0, y0, x1, y1, …] }]  — integer points in a fixed
--               1000-wide coordinate space, so it scales to any screen.
--
-- One row per (campaign, person). Leaving the campaign keeps the row
-- but locks it (like notes, 007); deleting the campaign deletes it.

create table if not exists boards (
  campaign_id uuid not null references campaigns (id) on delete cascade,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  strokes     jsonb not null default '[]'
              check (jsonb_typeof(strokes) = 'array' and octet_length(strokes::text) <= 1000000),
  updated_at  timestamptz not null default now(),
  primary key (campaign_id, owner_id)
);

-- The owner is whoever writes it; which board a row is never changes.
create or replace function stamp_board_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.owner_id := auth.uid();
  else
    new.owner_id := old.owner_id;
    new.campaign_id := old.campaign_id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists boards_stamp_owner on boards;
create trigger boards_stamp_owner
  before insert or update on boards
  for each row execute function stamp_board_owner();

alter table boards enable row level security;

drop policy if exists "owners use their own board" on boards;
create policy "owners use their own board" on boards
  for all using (owner_id = auth.uid() and is_campaign_member(campaign_id, auth.uid()))
  with check (owner_id = auth.uid() and is_campaign_member(campaign_id, auth.uid()));
