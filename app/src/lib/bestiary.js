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

// Reference samples — not stored anywhere, shown in an "Examples" panel
// and usable as a one-click starting point (see BestiaryScreen.jsx's
// "Use as Template"). One low-CR brute and one higher-CR leader, to show
// the stat block scales from "reskin and go" to "has a signature move."
export const EXAMPLES = [
  {
    name: 'Cliffside Ghoul',
    type: 'undead',
    size: 'Medium',
    armorClass: 13,
    hitPoints: 22,
    hitDice: '5d8',
    speed: '30 ft., climb 20 ft.',
    abilities: { str: 16, dex: 14, con: 12, int: 6, wis: 10, cha: 6 },
    challengeRating: '1',
    traits: 'Keen Smell. Has advantage on Wisdom (Perception) checks that rely on smell.',
    actions: 'Claw. Melee Weapon Attack: +5 to hit, reach 5 ft. Hit: 2d6+3 slashing damage.',
    notes: 'Lairs in the sea caves below Port Vessa — good early "why is this town scared" reveal.',
  },
  {
    name: 'Quartermaster Renn',
    type: 'humanoid, bandit captain',
    size: 'Medium',
    armorClass: 15,
    hitPoints: 58,
    hitDice: '9d8+18',
    speed: '30 ft.',
    abilities: { str: 14, dex: 16, con: 14, int: 12, wis: 12, cha: 15 },
    challengeRating: '3',
    traits: "Pack Tactics. Has advantage on an attack roll against a creature if at least one of Renn's allies is within 5 ft. of it.",
    actions:
      'Multiattack. Renn makes two scimitar attacks. Scimitar. Melee Weapon Attack: +5 to hit, reach 5 ft. Hit: 1d6+3 slashing damage.',
    notes: "The Undertow's local enforcer — a good mid-fight target to have surrender and talk instead of dying.",
  },
];

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
