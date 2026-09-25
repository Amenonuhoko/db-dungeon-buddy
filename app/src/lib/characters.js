import { ABILITY_KEYS, BLANK_ABILITIES, modifier } from './bestiary.js';
import { createLocalStore, createSupabaseStore } from './contentStore';
import { supabase } from './supabase';

export { ABILITY_KEYS, BLANK_ABILITIES, modifier };

const localSheets = createLocalStore('character_sheets');
const remoteSheets = createSupabaseStore('character_sheets');
const sheetsFor = (status) => (status === 'guest' ? localSheets : remoteSheets);

const localConditions = createLocalStore('character_conditions');
const remoteConditions = createSupabaseStore('character_conditions');
const conditionsFor = (status) => (status === 'guest' ? localConditions : remoteConditions);

// Guest campaigns have no real membership list — a sheet just belongs
// to "the one person playing," so every guest-created sheet uses this
// fixed id instead of a real auth.uid(). See BIBLE.md §7.
export const LOCAL_PLAYER_ID = 'local-player';

// Dropdown options for the "New Character" quick-create form
// (CharactersScreen.jsx) — the 12 core 5e classes and the PHB's common
// species, so picking one is the fast path. Neither list is enforced:
// `class_and_level`/`race` are still plain text columns, so "Other"
// falls through to a free-text field for homebrew/third-party options,
// same escape hatch the app already gives ability scores (BIBLE.md §7).
export const CLASSES = [
  'Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk',
  'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard',
];

export const RACES = [
  'Human', 'Elf', 'Half-Elf', 'Dwarf', 'Halfling', 'Gnome', 'Half-Orc', 'Dragonborn', 'Tiefling',
];

// Reference sample — not stored anywhere, shown in an "Examples" panel
// and usable as a one-click starting point (see CharactersScreen.jsx's
// "Use as Template"), same pattern as the other content types.
export const EXAMPLES = [
  {
    name: 'Mira Duskwalker',
    classAndLevel: 'Rogue 3',
    race: 'Half-Elf',
    background: "Criminal — knows every back alley in Port Vessa.",
    abilities: { str: 10, dex: 17, con: 12, int: 13, wis: 11, cha: 14 },
    armorClass: 14,
    maxHp: 24,
    currentHp: 24,
    speed: '30 ft.',
    equipment: "Shortsword, shortbow, thieves' tools, dark hooded cloak.",
    features: 'Sneak Attack (2d6). Cunning Action. Expertise: Stealth, Deception.',
  },
];

// class_and_level/race stay plain text columns in the database (a
// homebrew class or a third-party species is still just a string), so
// the dropdowns below are a UI convenience layered on top, not a schema
// change — this is what turns a stored "Rogue 3" back into a dropdown
// selection (or "Other" + the raw text) when starting from a template.
export function parseClassAndLevel(value) {
  const match = /^(.*?)\s+(\d+)\s*$/.exec((value || '').trim());
  const [name, level] = match ? [match[1], match[2]] : [(value || '').trim(), ''];
  if (!name) return { classChoice: '', customClass: '', level: '' };
  return CLASSES.includes(name)
    ? { classChoice: name, customClass: '', level }
    : { classChoice: 'Other', customClass: name, level };
}

export function parseRace(value) {
  const trimmed = (value || '').trim();
  if (!trimmed) return { raceChoice: '', customRace: '' };
  return RACES.includes(trimmed) ? { raceChoice: trimmed, customRace: '' } : { raceChoice: 'Other', customRace: trimmed };
}

export const BLANK_PICKS = { classChoice: '', customClass: '', level: '', raceChoice: '', customRace: '' };

// Turns a raw Supabase/Postgres error into something the person looking
// at the screen can actually act on — same "don't show a raw error"
// doctrine as lib/session.js's friendlyAuthError(). Branches on the
// Postgres SQLSTATE (err.code) rather than pattern-matching the message
// text, except for the one case (a bare RLS violation with no custom
// message) that needs its own explanation because it's specifically
// "the database hasn't been migrated yet," not "you're not allowed to
// do this" — every other 42501 already carries a specific, readable
// message from a database trigger (see check_sheet_player() in
// db/migrations/007_hardening.sql) and is shown as-is.
export function explainCreateError(err, isPlayer) {
  const message = err?.message || '';
  if (err?.code === '42501') {
    if (/row-level security policy/i.test(message)) {
      return isPlayer
        ? "This campaign's database hasn't been updated to let players create their own characters yet — ask your DM to run database update 007 (see the project README), or to add your character for you in the meantime."
        : "The database doesn't yet allow this — it may need database update 007 run (see the project README).";
    }
    return message; // a specific, already-readable message from a trigger
  }
  if (err?.code === '23503') return "That player or campaign couldn't be found — try refreshing the page and creating the character again.";
  if (err?.code === '23514' || err?.code === '23502') return message || "That character is missing something required — check every field and try again.";
  if (/fetch|network|NetworkError/i.test(message) || err?.name === 'TypeError') {
    return "Couldn't reach the server — check your connection and try again.";
  }
  return message || 'Something went wrong creating that character — try again in a moment.';
}

// Turns the quick form's `form` + dropdown `picks` into stored fields.
// New characters start at full health — one less number to enter.
export function finalizeQuickFields(form, picks) {
  const finalClass = picks.classChoice === 'Other' ? picks.customClass.trim() : picks.classChoice;
  const finalRace = picks.raceChoice === 'Other' ? picks.customRace.trim() : picks.raceChoice;
  const maxHp = form.maxHp === '' || form.maxHp == null ? null : Number(form.maxHp);
  return {
    name: form.name.trim(),
    classAndLevel: [finalClass, String(picks.level ?? '').trim()].filter(Boolean).join(' '),
    race: finalRace,
    armorClass: form.armorClass === '' || form.armorClass == null ? null : Number(form.armorClass),
    maxHp,
    currentHp: form.currentHp === '' || form.currentHp == null ? maxHp : Number(form.currentHp),
  };
}

export function listSheets(status, campaignId) {
  return sheetsFor(status).list(campaignId);
}

export function createSheet(status, campaignId, fields) {
  return sheetsFor(status).create(campaignId, fields);
}

export function updateSheet(status, campaignId, id, patch) {
  return sheetsFor(status).update(campaignId, id, patch);
}

export function removeSheet(status, campaignId, id) {
  return sheetsFor(status).remove(campaignId, id);
}

// Every condition in the campaign, not filtered to one sheet — RLS (for
// account mode) already trims this to what the caller is allowed to
// see (DM sees all, a player sees their own sheet's conditions plus any
// on other sheets flagged visible_to_party). The screen groups the
// result by characterId itself.
export function listConditions(status, campaignId) {
  return conditionsFor(status).list(campaignId);
}

export function addCondition(status, campaignId, fields) {
  return conditionsFor(status).create(campaignId, fields);
}

export function removeCondition(status, campaignId, id) {
  return conditionsFor(status).remove(campaignId, id);
}

// Clamped HP change for a PC — shared by the character sheet and the
// combat tracker, so a hit taken from either screen is the same write.
// Coming back above 0 HP clears death saves (they only mean anything
// while down); those keys are only sent when there's something to clear,
// so this stays a plain `currentHp` patch against a database that
// hasn't run 005_live_play.sql yet.
export function hpPatch(sheet, amount) {
  const max = sheet.maxHp ?? Infinity;
  const next = Math.max(0, Math.min(max, (sheet.currentHp ?? 0) + amount));
  const patch = { currentHp: next };
  if (next > 0 && (sheet.deathSaveSuccesses || sheet.deathSaveFailures)) {
    patch.deathSaveSuccesses = 0;
    patch.deathSaveFailures = 0;
  }
  return patch;
}

// Resources are freeform counters — spell slots, Ki, Rage, Channel
// Divinity — not a hard-coded 5e table (BIBLE.md §7). `shortRest` marks
// the ones that come back on a short rest (Warlock slots, Ki, …).
export function resourcesOf(sheet) {
  return Array.isArray(sheet.resources) ? sheet.resources : [];
}

// Long rest: full HP, every resource back to max, death saves cleared.
// Deliberately leaves conditions alone — which ones a rest clears is a
// DM call, not something to automate (BIBLE.md §8).
export function longRestPatch(sheet) {
  return {
    ...(sheet.maxHp != null ? { currentHp: sheet.maxHp } : {}),
    resources: resourcesOf(sheet).map((r) => ({ ...r, current: r.max })),
    deathSaveSuccesses: 0,
    deathSaveFailures: 0,
  };
}

export function shortRestPatch(sheet) {
  return { resources: resourcesOf(sheet).map((r) => (r.shortRest ? { ...r, current: r.max } : r)) };
}

// One death saving throw, 5e rules: 10+ is a success, a natural 1 counts
// as two failures, a natural 20 means you're back up with 1 HP. Returns
// the patch plus what happened, so the screen can say it out loud.
export function deathSavePatch(sheet, roll) {
  const successes = sheet.deathSaveSuccesses ?? 0;
  const failures = sheet.deathSaveFailures ?? 0;
  if (roll === 20) {
    return { patch: { currentHp: 1, deathSaveSuccesses: 0, deathSaveFailures: 0 }, outcome: 'Natural 20 — back on your feet with 1 HP!' };
  }
  if (roll === 1) {
    return { patch: { deathSaveFailures: Math.min(3, failures + 2) }, outcome: 'Natural 1 — two failures.' };
  }
  if (roll >= 10) {
    return { patch: { deathSaveSuccesses: Math.min(3, successes + 1) }, outcome: `Rolled ${roll} — a success.` };
  }
  return { patch: { deathSaveFailures: Math.min(3, failures + 1) }, outcome: `Rolled ${roll} — a failure.` };
}

export function sheetToMarkdown(sheet, conditions = []) {
  const abilities = { ...BLANK_ABILITIES, ...sheet.abilities };
  const abilityRow = ABILITY_KEYS.map((k) => `${abilities[k]} (${modifier(abilities[k])})`).join(' | ');
  const abilityHeader = ABILITY_KEYS.map((k) => k.toUpperCase()).join(' | ');
  const abilityDivider = ABILITY_KEYS.map(() => '---').join(' | ');

  const lines = [
    `# ${sheet.name}`,
    `*${sheet.classAndLevel || ''} — ${sheet.race || ''}*`.trim(),
    '',
    `**Armor Class** ${sheet.armorClass ?? '—'}`,
    `**Hit Points** ${sheet.currentHp ?? '—'} / ${sheet.maxHp ?? '—'}`,
    `**Speed** ${sheet.speed || '—'}`,
    '',
    `| ${abilityHeader} |`,
    `| ${abilityDivider} |`,
    `| ${abilityRow} |`,
  ];

  if (sheet.background?.trim()) lines.push('', `**Background** ${sheet.background.trim()}`);
  if (sheet.equipment?.trim()) lines.push('', '### Equipment', sheet.equipment.trim());
  if (sheet.features?.trim()) lines.push('', '### Features', sheet.features.trim());
  if (conditions.length > 0) {
    lines.push(
      '',
      '### Conditions',
      ...conditions.map((c) => `- **${c.label}**${c.note ? ` — ${c.note}` : ''}`),
    );
  }

  return lines.join('\n') + '\n';
}

export function sheetsToMarkdown(sheets, conditionsByCharacterId, campaignName) {
  const header = `# ${campaignName} — Characters\n\n`;
  return header + sheets.map((s) => sheetToMarkdown(s, conditionsByCharacterId[s.id] || [])).join('\n---\n\n');
}

// ---------------------------------------------------------------------
// Donning (db/migrations/009_characters.sql) — a player wears at most one
// character per campaign. A sheet with no playerId is in the campaign's
// open pool (a DM pre-made, or one somebody slipped out of); anyone at
// the table can slip into it, first come, first served. Account mode
// only — an offline campaign has one person on one device.
// ---------------------------------------------------------------------
function needs009(error) {
  if (error?.code === 'PGRST202' || /could not find the function/i.test(error?.message || '')) {
    return new Error("Slipping in and out of characters needs the latest database update — whoever runs the backend should run db/migrations/009_characters.sql (see README).");
  }
  return error;
}

export async function donCharacter(sheetId) {
  const { error } = await supabase.rpc('don_character', { p_sheet_id: sheetId });
  if (error) throw needs009(error);
}

export async function doffCharacter(campaignId) {
  const { error } = await supabase.rpc('doff_character', { p_campaign_id: campaignId });
  if (error) throw needs009(error);
}

// The DM helping someone in or out: hand a sheet to a member, or back to
// the pool with null. The database slips that member out of whatever
// they had on.
export function setWearer(status, campaignId, sheetId, userId) {
  return updateSheet(status, campaignId, sheetId, { playerId: userId || null });
}

export const isAvailable = (sheet) => !sheet.playerId;
export const wornByUser = (sheets, userId) => sheets.find((s) => s.playerId && s.playerId === userId) || null;

// "Mira Duskwalker (Wren)" — how someone reads at the table while wearing
// a character; just their name when they aren't.
export function tableName(playerName, characterName) {
  return characterName ? `${characterName} (${playerName})` : playerName;
}
