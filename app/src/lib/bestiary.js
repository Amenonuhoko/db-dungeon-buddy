import { createLocalStore, createSupabaseStore } from './contentStore';

const local = createLocalStore('bestiary');
const remote = createSupabaseStore('bestiary_entries');
const storeFor = (status) => (status === 'guest' ? local : remote);

export const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export const BLANK_ABILITIES = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };

export function modifier(score) {
  const mod = Math.floor((Number(score) - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

export function listCreatures(status, campaignId) {
  return storeFor(status).list(campaignId);
}

export function createCreature(status, campaignId, fields) {
  return storeFor(status).create(campaignId, fields);
}

export function updateCreature(status, campaignId, id, patch) {
  return storeFor(status).update(campaignId, id, patch);
}

export function removeCreature(status, campaignId, id) {
  return storeFor(status).remove(campaignId, id);
}

export function creatureToMarkdown(creature) {
  const abilities = { ...BLANK_ABILITIES, ...creature.abilities };
  const abilityRow = ABILITY_KEYS.map((k) => `${abilities[k]} (${modifier(abilities[k])})`).join(' | ');
  const abilityHeader = ABILITY_KEYS.map((k) => k.toUpperCase()).join(' | ');
  const abilityDivider = ABILITY_KEYS.map(() => '---').join(' | ');

  const lines = [
    `# ${creature.name}`,
    `*${creature.size || ''} ${creature.type || ''}*`.trim(),
    '',
    `**Armor Class** ${creature.armorClass ?? '—'}`,
    `**Hit Points** ${creature.hitPoints ?? '—'}${creature.hitDice ? ` (${creature.hitDice})` : ''}`,
    `**Speed** ${creature.speed || '—'}`,
    '',
    `| ${abilityHeader} |`,
    `| ${abilityDivider} |`,
    `| ${abilityRow} |`,
    '',
    `**Challenge Rating** ${creature.challengeRating ?? '—'}`,
  ];

  if (creature.traits?.trim()) {
    lines.push('', '### Traits', creature.traits.trim());
  }
  if (creature.actions?.trim()) {
    lines.push('', '### Actions', creature.actions.trim());
  }
  if (creature.notes?.trim()) {
    lines.push('', '### Notes', creature.notes.trim());
  }

  return lines.join('\n') + '\n';
}

export function creaturesToMarkdown(creatures, campaignName) {
  return `# ${campaignName} — Bestiary\n\n` + creatures.map(creatureToMarkdown).join('\n---\n\n');
}
