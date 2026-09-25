import { ABILITY_KEYS, BLANK_ABILITIES, modifier } from './bestiary.js';
import { createLocalStore, createSupabaseStore } from './contentStore';

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
