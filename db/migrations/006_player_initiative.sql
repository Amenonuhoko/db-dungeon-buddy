-- Dungeon Buddy — Supabase schema, migration 6 of N: players roll their
-- own initiative. Requires 005_live_play.sql. Safe to re-run.
--
-- Two changes so the DM doesn't have to relay every player's roll by
-- hand (BIBLE.md §7):
--
--   1. encounter_combatants.initiative becomes nullable, default null —
--      "hasn't rolled yet" is its own state instead of being
--      indistinguishable from a real roll of 0. The DM's "Begin Combat"
--      rolls for anyone still at null.
--   2. set_my_initiative(): the one thing a player may write on a
--      combatant row — the initiative of their own character. RLS is
--      row-level, not column-level, so opening an UPDATE policy to
--      players would also let them edit the rest of the row; a narrow
--      security-definer function that checks ownership and touches only
--      that column is the safe shape.

alter table encounter_combatants alter column initiative drop not null;
alter table encounter_combatants alter column initiative set default null;

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
