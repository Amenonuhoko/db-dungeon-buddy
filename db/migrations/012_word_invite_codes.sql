-- Dungeon Buddy — Supabase schema, migration 12 of N: invite codes you
-- can say out loud. Requires 001-011. Safe to re-run.
--
-- Codes were 10 random hex characters ("a3f9c01b7e") — safe, but hard to
-- read across a table or type on a phone. New codes are two words and a
-- number: "ember-wolf-417". Joining is forgiving about how it's typed —
-- capitals, spaces or underscores instead of hyphens, or no separators
-- at all ("Ember Wolf 417", "emberwolf417" both work).
--
-- Easier to remember also means easier to guess (~16 million combinations
-- rather than ~1 trillion), so wrong guesses are now limited: 10 wrong
-- codes per account per hour, on top of Supabase's per-IP limit on new
-- anonymous sign-ins. To make the limit stick, a wrong code no longer
-- raises an error (which would roll back the record of the attempt) —
-- join_campaign_with_code() returns NULL instead, and the app says
-- "that code doesn't match".
--
-- Existing campaigns keep their current code, so links already sent keep
-- working; "Reset link" (and every new campaign) hands out a word code.

create or replace function new_invite_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  adjectives text[] := array[
    'amber', 'ancient', 'arcane', 'ashen', 'azure', 'bold', 'brave',
    'bright', 'bronze', 'brisk', 'calm', 'clever', 'cobalt', 'copper',
    'crimson', 'crystal', 'cunning', 'daring', 'dawn', 'deep', 'dusky',
    'eager', 'ebony', 'elder', 'ember', 'emerald', 'fabled', 'fair', 'feral',
    'fierce', 'fiery', 'frosty', 'gentle', 'ghostly', 'gilded', 'glad',
    'golden', 'grand', 'grassy', 'hidden', 'hollow', 'honest', 'humble',
    'icy', 'iron', 'ivory', 'jade', 'jolly', 'keen', 'kind', 'lively',
    'lone', 'lost', 'loyal', 'lucky', 'lunar', 'merry', 'mighty', 'misty',
    'mossy', 'noble', 'oaken', 'old', 'pale', 'plucky', 'proud', 'quick',
    'quiet', 'rapid', 'rare', 'regal', 'restless', 'rocky', 'rosy', 'rowan',
    'royal', 'rusty', 'sandy', 'scarlet', 'secret', 'shady', 'shining',
    'silent', 'silver', 'sleepy', 'sly', 'smoky', 'snowy', 'solar', 'sonic',
    'stark', 'steady', 'stormy', 'sturdy', 'sunny', 'swift', 'tall', 'tawny',
    'tidal', 'tiny', 'true', 'twilight', 'velvet', 'verdant', 'vivid',
    'wandering', 'warm', 'wild', 'windy', 'winter', 'wise', 'wooden',
    'young', 'zesty', 'brass', 'cloudy', 'dusty', 'foggy', 'frozen', 'hazy',
    'lucid', 'burly', 'cosmic', 'dreamy', 'gallant', 'hardy', 'nimble',
    'radiant'
  ];
  nouns text[] := array[
    'anvil', 'arrow', 'badger', 'banner', 'bard', 'beacon', 'bear', 'bell',
    'blade', 'boar', 'bramble', 'candle', 'castle', 'cauldron', 'cavern',
    'cinder', 'cloak', 'comet', 'crow', 'crown', 'dagger', 'drake', 'dragon',
    'dune', 'eagle', 'falcon', 'feather', 'fern', 'flask', 'forge', 'fox',
    'gauntlet', 'gem', 'giant', 'goblet', 'golem', 'griffin', 'grove',
    'hammer', 'harp', 'hawk', 'helm', 'heron', 'hound', 'hydra', 'kestrel',
    'key', 'knight', 'lantern', 'lark', 'lion', 'lute', 'mage', 'map',
    'mask', 'meadow', 'mimic', 'moon', 'moth', 'oak', 'oracle', 'otter',
    'owl', 'pegasus', 'phoenix', 'pike', 'potion', 'quill', 'raven', 'relic',
    'ridge', 'river', 'rogue', 'rune', 'sage', 'satchel', 'scroll',
    'serpent', 'shield', 'sparrow', 'spear', 'sphinx', 'spire', 'sprite',
    'staff', 'stag', 'star', 'stone', 'storm', 'sword', 'thorn', 'tiger',
    'toad', 'tome', 'torch', 'tower', 'troll', 'unicorn', 'valley', 'viper',
    'wand', 'wizard', 'wolf', 'wren', 'wyvern', 'yeti', 'acorn', 'apple',
    'basilisk', 'beetle', 'boots', 'bridge', 'brook', 'canyon', 'chalice',
    'chest', 'cliff', 'clover', 'compass', 'coral', 'dice', 'drum', 'fable',
    'fjord', 'goose', 'harbor', 'hearth', 'island', 'ivy', 'jester',
    'kraken', 'ladder', 'lagoon', 'lynx', 'marsh', 'mirror'
  ];
  v_code text;
begin
  loop
    -- gen_random_uuid() is the core-Postgres randomness source here (no
    -- pgcrypto needed); its bytes pick the words and the number.
    v_code := adjectives[1 + (('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint % array_length(adjectives, 1))]
      || '-' || nouns[1 + (('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint % array_length(nouns, 1))]
      || '-' || (100 + (('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint % 900))::text;
    exit when not exists (
      select 1 from campaigns where replace(invite_code, '-', '') = replace(v_code, '-', '')
    );
  end loop;
  return v_code;
end;
$$;

-- New campaigns get a word code.
alter table campaigns alter column invite_code set default new_invite_code();

-- Codes may now contain hyphens (007's format check allowed only [a-z0-9]).
alter table campaigns drop constraint if exists campaigns_invite_code_format;
alter table campaigns add constraint campaigns_invite_code_format
  check (invite_code ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(invite_code) between 8 and 40) not valid;

-- Lookups ignore hyphens, so index the code that way.
create index if not exists campaigns_invite_code_compact_idx on campaigns (replace(invite_code, '-', ''));

-- Wrong guesses, per account. Written only by join_campaign_with_code()
-- (security definer); RLS on with no policies means nobody reads or
-- writes it directly.
create table if not exists join_attempts (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index if not exists join_attempts_user_idx on join_attempts (user_id, attempted_at desc);

alter table join_attempts enable row level security;

create or replace function join_campaign_with_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_id uuid;
  -- Forgiving input: case, spaces, underscores and hyphens don't matter.
  v_compact text := regexp_replace(lower(coalesce(p_code, '')), '[^a-z0-9]', '', 'g');
begin
  if auth.uid() is null then
    raise exception 'Sign in before joining a campaign';
  end if;

  if (select count(*) from join_attempts where user_id = auth.uid() and attempted_at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many wrong codes — wait a little while and try again';
  end if;

  if v_compact <> '' then
    select id into v_campaign_id from campaigns where replace(invite_code, '-', '') = v_compact;
  end if;

  if v_campaign_id is null then
    insert into join_attempts (user_id) values (auth.uid());
    delete from join_attempts where attempted_at < now() - interval '1 day';
    return null; -- the app reads NULL as "that code doesn't match"
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
  v_code := new_invite_code();
  update campaigns set invite_code = v_code where id = p_campaign_id;
  return v_code;
end;
$$;

revoke all on function regenerate_invite_code(uuid) from public;
grant execute on function regenerate_invite_code(uuid) to authenticated;
