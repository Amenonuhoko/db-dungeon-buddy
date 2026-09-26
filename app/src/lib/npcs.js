import { createLocalStore, createSupabaseStore } from './contentStore';

// The campaign's NPCs (020). Standard fare comes ready-made: an archetype
// gives an emblem, a colour and stats close to the SRD's (Commoner,
// Guard, Veteran, Noble, Priest, Mage, Bandit…), so "a guard steps
// forward" is one tap. A name, a look, an attitude and a Bestiary stat
// block make one of them somebody, when the story needs it.

const local = createLocalStore('npcs');
const remote = createSupabaseStore('npcs');
const storeFor = (status) => (status === 'guest' ? local : remote);

export const ARCHETYPES = [
  { id: 'commoner', name: 'Commoner', hue: 35, ac: 10, hp: 4, dex: 0 },
  { id: 'innkeeper', name: 'Innkeeper', hue: 28, ac: 10, hp: 4, dex: 0 },
  { id: 'merchant', name: 'Merchant', hue: 45, ac: 10, hp: 4, dex: 0 },
  { id: 'blacksmith', name: 'Blacksmith', hue: 15, ac: 11, hp: 32, dex: 0 },
  { id: 'farmer', name: 'Farmer', hue: 80, ac: 10, hp: 4, dex: 0 },
  { id: 'guard', name: 'Guard', hue: 210, ac: 16, hp: 11, dex: 1 },
  { id: 'captain', name: 'Captain', hue: 220, ac: 17, hp: 58, dex: 1 },
  { id: 'noble', name: 'Noble', hue: 285, ac: 15, hp: 9, dex: 1 },
  { id: 'priest', name: 'Priest', hue: 50, ac: 13, hp: 27, dex: 0 },
  { id: 'sage', name: 'Sage', hue: 190, ac: 10, hp: 9, dex: 0 },
  { id: 'mage', name: 'Mage', hue: 265, ac: 12, hp: 40, dex: 2 },
  { id: 'scout', name: 'Scout', hue: 120, ac: 13, hp: 16, dex: 2 },
  { id: 'spy', name: 'Spy', hue: 330, ac: 12, hp: 27, dex: 2 },
  { id: 'knight', name: 'Knight', hue: 200, ac: 18, hp: 52, dex: 0 },
  { id: 'bandit', name: 'Bandit', hue: 0, ac: 12, hp: 11, dex: 1 },
  { id: 'thug', name: 'Thug', hue: 10, ac: 11, hp: 32, dex: 0 },
  { id: 'cultist', name: 'Cultist', hue: 300, ac: 12, hp: 9, dex: 1 },
];

export const archetypeOf = (id) => ARCHETYPES.find((a) => a.id === id) || ARCHETYPES[0];

export const ATTITUDES = [
  { id: 'friendly', name: 'Friendly' },
  { id: 'neutral', name: 'Neutral' },
  { id: 'wary', name: 'Wary' },
  { id: 'hostile', name: 'Hostile' },
];

// A name in a pinch: "What's the barkeep called?" — "Bram Tallow."
const FIRST = [
  'Bram', 'Odile', 'Tamsin', 'Garrick', 'Wren', 'Idris', 'Maren', 'Corwin', 'Esme', 'Hollis', 'Juno', 'Kestrel',
  'Lysa', 'Orrin', 'Perrin', 'Quill', 'Rosalind', 'Silas', 'Tobias', 'Ulla', 'Vesper', 'Willem', 'Yara', 'Zeb',
  'Agnes', 'Borin', 'Delphine', 'Faelan', 'Greta', 'Hux',
];
const LAST = [
  'Tallow', 'Ashdown', 'Brightwater', 'Coldiron', 'Dunmore', 'Fairweather', 'Greaves', 'Hollowell', 'Ironside',
  'Kettleby', 'Larkspur', 'Marlowe', 'Nettle', 'Oakhart', 'Pennywhistle', 'Quarry', 'Ravensworth', 'Stonebridge',
  'Thistlewood', 'Underhill', 'Vane', 'Whitlock',
];
export const randomName = () => `${FIRST[Math.floor(Math.random() * FIRST.length)]} ${LAST[Math.floor(Math.random() * LAST.length)]}`;

export function listNpcs(status, campaignId) {
  return storeFor(status).list(campaignId);
}

export function createNpc(status, campaignId, fields) {
  const a = archetypeOf(fields.archetype);
  return storeFor(status).create(campaignId, {
    archetype: a.id,
    look: null,
    attitude: 'neutral',
    armorClass: a.ac,
    maxHp: a.hp,
    dexMod: a.dex,
    met: false,
    ...fields,
  });
}

export function updateNpc(status, campaignId, id, patch) {
  return storeFor(status).update(campaignId, id, patch);
}

export function removeNpc(status, campaignId, id) {
  return storeFor(status).remove(campaignId, id);
}
