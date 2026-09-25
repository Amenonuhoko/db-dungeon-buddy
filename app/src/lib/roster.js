import { BLANK_ABILITIES, createSheet, resourcesOf, updateSheet } from './characters.js';
import { supabase } from './supabase';

// My Characters (db/migrations/009_characters.sql) — an account holder's
// own characters, outside any campaign. Bringing one into a campaign
// makes a copy there (HP, conditions and resources then belong to that
// campaign); "Save to My Characters" on a campaign sheet copies its
// current state back — level-ups, gear, features. Accounts only: an
// anonymous player has no way back into a roster on another day.
const COLUMNS = 'id, name, class_and_level, race, background, abilities, armor_class, max_hp, speed, equipment, features, resources, updated_at';

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
  };
}

export function isMissingRoster(error) {
  return error?.code === '42P01' || error?.code === 'PGRST205' || /roster_characters/i.test(error?.message || '');
}

export async function listRoster() {
  const { data, error } = await supabase.from('roster_characters').select(COLUMNS).order('name');
  if (error) throw error;
  return data.map(toCharacter);
}

export async function createRosterCharacter(character) {
  const { data, error } = await supabase.from('roster_characters').insert(rosterRow(character)).select(COLUMNS).single();
  if (error) throw error;
  return toCharacter(data);
}

export async function updateRosterCharacter(id, character) {
  const { data, error } = await supabase.from('roster_characters').update(rosterRow(character)).eq('id', id).select(COLUMNS);
  if (error) throw error;
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
