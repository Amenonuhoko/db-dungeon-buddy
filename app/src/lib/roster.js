import { BLANK_ABILITIES, createSheet, resourcesOf, updateSheet } from './characters.js';
import {
  copyPortrait,
  deletePortraitFile,
  renderPortrait,
  rosterPortraitFolder,
  sheetPortraitFolder,
  uploadPortrait,
} from './portraits.js';
import { supabase } from './supabase';

// My Characters (db/migrations/009_characters.sql) — an account holder's
// own characters, outside any campaign. Bringing one into a campaign
// makes a copy there (HP, conditions and resources then belong to that
// campaign); "Save to My Characters" on a campaign sheet copies its
// current state back — level-ups, gear, features. Accounts only: an
// anonymous player has no way back into a roster on another day.
const COLUMNS_V1 = 'id, name, class_and_level, race, background, abilities, armor_class, max_hp, speed, equipment, features, resources, updated_at';
// 011 adds the story, personality prompts, inventory and coins; a backend
// without it yet quietly gets the 009 columns.
const COLUMNS_V2 = `${COLUMNS_V1}, backstory, personality_traits, ideals, bonds, flaws, inventory, coins`;
// 014 adds the portrait.
const COLUMNS_V3 = `${COLUMNS_V2}, portrait_path`;
const TIERS = [COLUMNS_V3, COLUMNS_V2, COLUMNS_V1];
let columns = COLUMNS_V3;
const hasStory = () => columns !== COLUMNS_V1;
const EXTRA_FIELDS = ['backstory', 'personalityTraits', 'ideals', 'bonds', 'flaws', 'inventory', 'coins'];

function columnMissing(error) {
  return error?.code === '42703' || error?.code === 'PGRST204' || /column .* does not exist|could not find the '.*' column/i.test(error?.message || '');
}

async function withColumns(run) {
  let asked = columns;
  let { data, error } = await run(asked);
  // Step down a tier at a time, judged by what *this* request asked for —
  // concurrent loads can race.
  while (error && columnMissing(error) && TIERS.indexOf(asked) < TIERS.length - 1) {
    asked = TIERS[TIERS.indexOf(asked) + 1];
    if (TIERS.indexOf(asked) > TIERS.indexOf(columns)) columns = asked;
    ({ data, error } = await run(asked));
  }
  if (error) throw error;
  return data;
}

function toCharacter(row) {
  return {
    id: row.id,
    name: row.name,
    classAndLevel: row.class_and_level,
    race: row.race,
    background: row.background,
    abilities: row.abilities,
    armorClass: row.armor_class,
    maxHp: row.max_hp,
    speed: row.speed,
    equipment: row.equipment,
    features: row.features,
    resources: row.resources,
    backstory: row.backstory ?? '',
    personalityTraits: row.personality_traits ?? '',
    ideals: row.ideals ?? '',
    bonds: row.bonds ?? '',
    flaws: row.flaws ?? '',
    inventory: Array.isArray(row.inventory) ? row.inventory : [],
    coins: row.coins || { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
    portraitPath: row.portrait_path ?? null,
    updatedAt: row.updated_at,
  };
}

// The sheet fields worth carrying between campaigns — never HP taken,
// death saves or conditions, which belong to one campaign's story.
function rosterRow(character) {
  return {
    name: character.name,
    class_and_level: character.classAndLevel || '',
    race: character.race || '',
    background: character.background || '',
    abilities: character.abilities || BLANK_ABILITIES,
    armor_class: character.armorClass ?? null,
    max_hp: character.maxHp ?? null,
    speed: character.speed || '30 ft.',
    equipment: character.equipment || '',
    features: character.features || '',
    resources: resourcesOf(character).map((r) => ({ ...r, current: r.max })),
    ...(hasStory()
      ? {
          backstory: character.backstory || '',
          personality_traits: character.personalityTraits || '',
          ideals: character.ideals || '',
          bonds: character.bonds || '',
          flaws: character.flaws || '',
          inventory: Array.isArray(character.inventory) ? character.inventory : [],
          coins: character.coins || { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
        }
      : {}),
  };
}

export function isMissingRoster(error) {
  return error?.code === '42P01' || error?.code === 'PGRST205' || /roster_characters/i.test(error?.message || '');
}

export async function listRoster() {
  const data = await withColumns((cols) => supabase.from('roster_characters').select(cols).order('name'));
  return data.map(toCharacter);
}

export async function createRosterCharacter(character) {
  const data = await withColumns((cols) => supabase.from('roster_characters').insert(rosterRow(character)).select(cols).single());
  return toCharacter(data);
}

export async function updateRosterCharacter(id, character) {
  const data = await withColumns((cols) => supabase.from('roster_characters').update(rosterRow(character)).eq('id', id).select(cols));
  return data.length ? toCharacter(data[0]) : null;
}

export async function deleteRosterCharacter(id, portraitPath = null) {
  await deletePortraitFile(portraitPath);
  const { error } = await supabase.from('roster_characters').delete().eq('id', id);
  if (error) throw error;
}

async function setRosterPortraitPath(id, path) {
  const data = await withColumns((cols) =>
    supabase.from('roster_characters').update({ portrait_path: path }).eq('id', id).select(cols),
  );
  if (!data.length) throw new Error("That character isn't in your My Characters any more.");
  return toCharacter(data[0]);
}

async function myId() {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user?.id;
  if (!id) throw new Error('Your session expired — log in again.');
  return id;
}

// A new portrait for a My Characters entry — same steps as a campaign
// sheet's (lib/characters.js saveSheetPortrait), in the owner's folder.
export async function saveRosterPortrait(character, img, crop) {
  const path = await uploadPortrait(rosterPortraitFolder(await myId(), character.id), await renderPortrait(img, crop));
  let updated;
  try {
    updated = await setRosterPortraitPath(character.id, path);
  } catch (err) {
    await deletePortraitFile(path);
    throw err;
  }
  await deletePortraitFile(character.portraitPath);
  return updated;
}

export async function removeRosterPortrait(character) {
  const updated = await setRosterPortraitPath(character.id, null);
  await deletePortraitFile(character.portraitPath);
  return updated;
}

// Put a roster character on in a campaign: a fresh copy at full health,
// worn by the caller (which slips them out of anything they had on). The
// portrait comes too, copied into the campaign — if that fails the
// character still comes, just without it.
export async function bringIntoCampaign(campaignId, userId, character) {
  const sheet = await createSheet('authenticated', campaignId, {
    name: character.name,
    classAndLevel: character.classAndLevel || '',
    race: character.race || '',
    background: character.background || '',
    abilities: character.abilities || BLANK_ABILITIES,
    armorClass: character.armorClass ?? null,
    maxHp: character.maxHp ?? null,
    currentHp: character.maxHp ?? null,
    speed: character.speed || '30 ft.',
    equipment: character.equipment || '',
    features: character.features || '',
    resources: resourcesOf(character).map((r) => ({ ...r, current: r.max })),
    ...Object.fromEntries(EXTRA_FIELDS.filter((key) => character[key] !== undefined && hasStory()).map((key) => [key, character[key]])),
    playerId: userId,
    rosterId: character.id,
  });
  const copied = await copyPortrait(character.portraitPath, sheetPortraitFolder(campaignId, sheet.id));
  if (!copied) return sheet;
  try {
    return await updateSheet('authenticated', campaignId, sheet.id, { portraitPath: copied });
  } catch {
    await deletePortraitFile(copied);
    return sheet;
  }
}

// The sheet's portrait into the roster entry's folder, replacing its old
// one. Best effort, like the rest of the portrait copying.
async function carryPortraitBack(character, sheet) {
  if (!sheet.portraitPath) return character;
  const copied = await copyPortrait(sheet.portraitPath, rosterPortraitFolder(await myId(), character.id));
  if (!copied) return character;
  try {
    const updated = await setRosterPortraitPath(character.id, copied);
    await deletePortraitFile(character.portraitPath);
    return updated;
  } catch {
    await deletePortraitFile(copied);
    return character;
  }
}

// Copy a campaign sheet's progress back into My Characters — updating
// the roster character it came from, or adding a new one (and linking
// the sheet to it) if it didn't come from one or that one was deleted.
export async function saveSheetToRoster(campaignId, sheet) {
  if (sheet.rosterId) {
    const updated = await updateRosterCharacter(sheet.rosterId, sheet);
    if (updated) return { character: await carryPortraitBack(updated, sheet), created: false };
  }
  const created = await createRosterCharacter(sheet);
  await updateSheet('authenticated', campaignId, sheet.id, { rosterId: created.id });
  return { character: await carryPortraitBack(created, sheet), created: true };
}
