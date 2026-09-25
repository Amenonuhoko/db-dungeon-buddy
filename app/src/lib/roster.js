import { BLANK_ABILITIES, createSheet, resourcesOf, updateSheet } from './characters.js';
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
let columns = COLUMNS_V2;
const EXTRA_FIELDS = ['backstory', 'personalityTraits', 'ideals', 'bonds', 'flaws', 'inventory', 'coins'];

function columnMissing(error) {
  return error?.code === '42703' || error?.code === 'PGRST204' || /column .* does not exist|could not find the '.*' column/i.test(error?.message || '');
}

async function withColumns(run) {
  const asked = columns;
  let { data, error } = await run(columns);
  // Judge by what this request asked for — concurrent loads can race.
  if (error && columnMissing(error) && asked === COLUMNS_V2) {
    columns = COLUMNS_V1;
    ({ data, error } = await run(columns));
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
    ...(columns === COLUMNS_V2
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

export async function deleteRosterCharacter(id) {
  const { error } = await supabase.from('roster_characters').delete().eq('id', id);
  if (error) throw error;
}

// Put a roster character on in a campaign: a fresh copy at full health,
// worn by the caller (which slips them out of anything they had on).
export function bringIntoCampaign(campaignId, userId, character) {
  return createSheet('authenticated', campaignId, {
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
    ...Object.fromEntries(EXTRA_FIELDS.filter((key) => character[key] !== undefined && columns === COLUMNS_V2).map((key) => [key, character[key]])),
    playerId: userId,
    rosterId: character.id,
  });
}

// Copy a campaign sheet's progress back into My Characters — updating
// the roster character it came from, or adding a new one (and linking
// the sheet to it) if it didn't come from one or that one was deleted.
export async function saveSheetToRoster(campaignId, sheet) {
  if (sheet.rosterId) {
    const updated = await updateRosterCharacter(sheet.rosterId, sheet);
    if (updated) return { character: updated, created: false };
  }
  const created = await createRosterCharacter(sheet);
  await updateSheet('authenticated', campaignId, sheet.id, { rosterId: created.id });
  return { character: created, created: true };
}
