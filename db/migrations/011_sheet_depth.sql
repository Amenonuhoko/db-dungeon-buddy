-- Dungeon Buddy — Supabase schema, migration 11 of N: a fuller character.
-- Requires 001-010. Safe to re-run.
--
-- More of what a paper sheet holds, all of it private (the DM and the
-- character's player only — 010), and carried by My Characters too so a
-- character brings its story and belongings between campaigns:
--
--   - backstory (long text);
--   - the four personality prompts — traits, ideals, bonds, flaws;
--   - inventory: a list of { name, qty, note, equipped } items, replacing
--     "write it all in one text box" (the old equipment text stays, as
--     free-form gear notes);
--   - coins: the character's own purse, { pp, gp, ep, sp, cp } — separate
--     from the party's shared stash (008).

do $$
declare
  t text;
begin
  foreach t in array array['character_details', 'roster_characters']
  loop
    execute format($f$
      alter table %1$I
        add column if not exists backstory          text  not null default '',
        add column if not exists personality_traits text  not null default '',
        add column if not exists ideals             text  not null default '',
        add column if not exists bonds              text  not null default '',
        add column if not exists flaws              text  not null default '',
        add column if not exists inventory          jsonb not null default '[]',
        add column if not exists coins              jsonb not null default '{"pp":0,"gp":0,"ep":0,"sp":0,"cp":0}'
    $f$, t);

    execute format('alter table %1$I drop constraint if exists %1$s_story_len', t);
    execute format($f$
      alter table %1$I add constraint %1$s_story_len check (
        char_length(backstory) <= 20000
        and char_length(personality_traits) <= 2000
        and char_length(ideals) <= 2000
        and char_length(bonds) <= 2000
        and char_length(flaws) <= 2000
      ) not valid
    $f$, t);

    execute format('alter table %1$I drop constraint if exists %1$s_inventory_shape', t);
    execute format($f$
      alter table %1$I add constraint %1$s_inventory_shape check (
        jsonb_typeof(inventory) = 'array'
        and jsonb_array_length(inventory) <= 200
        and octet_length(inventory::text) <= 40000
      ) not valid
    $f$, t);

    execute format('alter table %1$I drop constraint if exists %1$s_coins_shape', t);
    execute format($f$
      alter table %1$I add constraint %1$s_coins_shape check (
        jsonb_typeof(coins) = 'object'
        and octet_length(coins::text) <= 500
      ) not valid
    $f$, t);
  end loop;
end;
$$;
