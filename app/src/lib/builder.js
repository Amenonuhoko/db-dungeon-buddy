// Kept free of imports (same list as lib/bestiary.js) so it stays pure.
const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const abilityMod = (score) => Math.floor((Number(score ?? 10) - 10) / 2);

// The guided character builder (components/CharacterBuilder.jsx): ability
// scores by standard array, point buy or 4d6-drop-lowest, a background,
// and suggested HP, AC, speed, saving throws and class resources worked
// out from the choices. Everything it suggests lands on the sheet as
// ordinary editable fields — nothing here is enforced afterwards, same
// as the rest of the app (BIBLE.md §7). The numbers follow the 5e
// Player's Handbook; tables playing another edition just edit the
// suggestion on the last step.

export const ABILITY_NAMES = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

export const POINT_BUY_BUDGET = 27;
export const POINT_BUY_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

export function pointBuySpent(scores) {
  return ABILITY_KEYS.reduce((sum, key) => sum + (POINT_BUY_COST[scores[key]] ?? 0), 0);
}

function rollDie(sides) {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] % sides) + 1;
}

// One ability score the old-fashioned way: roll four d6, keep the best
// three. Returns the dice too, so the screen can show the dropped one.
export function roll4d6() {
  const dice = [rollDie(6), rollDie(6), rollDie(6), rollDie(6)];
  const dropped = dice.indexOf(Math.min(...dice));
  const total = dice.reduce((sum, d, i) => (i === dropped ? sum : sum + d), 0);
  return { dice, dropped, total };
}

// Per class: hit die, saving throw proficiencies, which abilities matter
// most (for "Best fit"), and a rough starting-armor AC.
export const CLASS_INFO = {
  Barbarian: { hitDie: 12, saves: ['str', 'con'], priority: ['str', 'con', 'dex', 'wis', 'cha', 'int'] },
  Bard: { hitDie: 8, saves: ['dex', 'cha'], priority: ['cha', 'dex', 'con', 'wis', 'int', 'str'], caster: 'full' },
  Cleric: { hitDie: 8, saves: ['wis', 'cha'], priority: ['wis', 'con', 'str', 'cha', 'dex', 'int'], caster: 'full' },
  Druid: { hitDie: 8, saves: ['int', 'wis'], priority: ['wis', 'con', 'dex', 'int', 'cha', 'str'], caster: 'full' },
  Fighter: { hitDie: 10, saves: ['str', 'con'], priority: ['str', 'con', 'dex', 'wis', 'int', 'cha'] },
  Monk: { hitDie: 8, saves: ['str', 'dex'], priority: ['dex', 'wis', 'con', 'str', 'int', 'cha'] },
  Paladin: { hitDie: 10, saves: ['wis', 'cha'], priority: ['str', 'cha', 'con', 'wis', 'dex', 'int'], caster: 'half' },
  Ranger: { hitDie: 10, saves: ['str', 'dex'], priority: ['dex', 'wis', 'con', 'str', 'int', 'cha'], caster: 'half' },
  Rogue: { hitDie: 8, saves: ['dex', 'int'], priority: ['dex', 'con', 'wis', 'int', 'cha', 'str'] },
  Sorcerer: { hitDie: 6, saves: ['con', 'cha'], priority: ['cha', 'con', 'dex', 'wis', 'int', 'str'], caster: 'full' },
  Warlock: { hitDie: 8, saves: ['wis', 'cha'], priority: ['cha', 'con', 'dex', 'wis', 'int', 'str'] },
  Wizard: { hitDie: 6, saves: ['int', 'wis'], priority: ['int', 'con', 'dex', 'wis', 'cha', 'str'], caster: 'full' },
};

export const HIT_DICE = [6, 8, 10, 12];

// Species with a shorter stride (the 2014 PHB's 25 ft.); everyone else 30.
const SHORT_STRIDE = ['Dwarf', 'Halfling', 'Gnome'];

export function suggestSpeed(race) {
  return SHORT_STRIDE.includes(race) ? '25 ft.' : '30 ft.';
}

export const BACKGROUNDS = [
  'Acolyte', 'Artisan', 'Charlatan', 'Criminal', 'Entertainer', 'Farmer', 'Folk Hero', 'Guard', 'Guide',
  'Guild Artisan', 'Hermit', 'Merchant', 'Noble', 'Outlander', 'Sage', 'Sailor', 'Scribe', 'Soldier',
  'Urchin', 'Wayfarer',
];

// The "+2 and +1" (or three +1s) most tables now take from background or
// species, instead of a fixed bonus per species. "Classic Human" is +1
// to everything.
export const BONUS_MODES = [
  { id: 'two-one', label: '+2 to one, +1 to another' },
  { id: 'three-ones', label: '+1 to three' },
  { id: 'all', label: '+1 to all six (classic Human)' },
  { id: 'none', label: 'No bonuses' },
];

export function applyBonuses(base, mode, picks) {
  const bonus = Object.fromEntries(ABILITY_KEYS.map((k) => [k, 0]));
  if (mode === 'two-one') {
    if (picks[0]) bonus[picks[0]] += 2;
    if (picks[1] && picks[1] !== picks[0]) bonus[picks[1]] += 1;
  } else if (mode === 'three-ones') {
    for (const key of new Set(picks.slice(0, 3).filter(Boolean))) bonus[key] += 1;
  } else if (mode === 'all') {
    for (const key of ABILITY_KEYS) bonus[key] = 1;
  }
  return Object.fromEntries(ABILITY_KEYS.map((k) => [k, Math.min(20, (Number(base[k]) || 0) + bonus[k])]));
}

// Assign a list of scores (standard array or rolled) to abilities in the
// class's order of importance. Returns { ability: index into values }.
export function bestFit(values, className) {
  const order = CLASS_INFO[className]?.priority || ABILITY_KEYS;
  const byValue = values.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
  return Object.fromEntries(order.map((key, rank) => [key, byValue[rank][1]]));
}

// Max hit die plus CON at 1st level, then the fixed average (half the die
// + 1) plus CON per level after — never less than 1 a level.
export function suggestHp(hitDie, level, con) {
  const mod = abilityMod(con);
  const lvl = Math.max(1, Math.min(20, Number(level) || 1));
  let hp = Math.max(1, hitDie + mod);
  for (let i = 2; i <= lvl; i++) hp += Math.max(1, hitDie / 2 + 1 + mod);
  return hp;
}

// A rough AC from the class's usual starting armor, with how it was got
// so the player knows what to change if they bought something else.
export function suggestAc(className, abilities) {
  const dex = abilityMod(abilities.dex);
  const con = abilityMod(abilities.con);
  const wis = abilityMod(abilities.wis);
  const medium = 14 + Math.min(dex, 2);
  const leather = 11 + dex;
  switch (className) {
    case 'Barbarian':
      return { ac: 10 + dex + con, how: 'Unarmored Defense: 10 + DEX + CON' };
    case 'Monk':
      return { ac: 10 + dex + wis, how: 'Unarmored Defense: 10 + DEX + WIS' };
    case 'Fighter':
      return leather > 16
        ? { ac: leather, how: 'Leather armor: 11 + DEX' }
        : { ac: 16, how: 'Chain mail: 16 (add 2 with a shield)' };
    case 'Paladin':
      return { ac: 18, how: 'Chain mail + shield: 16 + 2' };
    case 'Cleric':
      return { ac: medium + 2, how: 'Scale mail + shield: 14 + DEX (max 2) + 2' };
    case 'Ranger':
      return medium >= leather
        ? { ac: medium, how: 'Scale mail: 14 + DEX (max 2)' }
        : { ac: leather, how: 'Leather armor: 11 + DEX' };
    case 'Druid':
      return { ac: leather + 2, how: 'Leather armor + wooden shield: 11 + DEX + 2' };
    case 'Bard':
    case 'Rogue':
    case 'Warlock':
      return { ac: leather, how: 'Leather armor: 11 + DEX' };
    case 'Sorcerer':
    case 'Wizard':
      return { ac: 10 + dex, how: 'No armor: 10 + DEX (13 + DEX with Mage Armor)' };
    default:
      return { ac: 10 + dex, how: 'No armor: 10 + DEX' };
  }
}

// Spell slots by caster level, 1st through 9th (PHB multiclass table).
const FULL_CASTER_SLOTS = [
  [],
  [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];
const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

function slotResources(casterLevel) {
  return (FULL_CASTER_SLOTS[casterLevel] || []).map((max, i) => ({ label: `${ORDINAL[i]}-level spell slots`, max }));
}

const byLevel = (level, steps) => steps.reduce((value, [from, v]) => (level >= from ? v : value), 0);

// The counters each class starts tracking — the same freeform resources
// players add by hand on the sheet ({ label, max, current, shortRest }).
export function suggestResources(className, level, abilities) {
  const lvl = Math.max(1, Math.min(20, Number(level) || 1));
  const cha = abilityMod(abilities.cha);
  const out = [];
  const add = (label, max, shortRest = false) => {
    if (max > 0) out.push({ label, max, current: max, shortRest });
  };
  switch (className) {
    case 'Barbarian':
      if (lvl < 20) add('Rage', byLevel(lvl, [[1, 2], [3, 3], [6, 4], [12, 5], [17, 6]]));
      break;
    case 'Bard':
      add('Bardic Inspiration', Math.max(1, cha), lvl >= 5);
      break;
    case 'Cleric':
      add('Channel Divinity', byLevel(lvl, [[2, 1], [6, 2], [18, 3]]), true);
      break;
    case 'Druid':
      add('Wild Shape', lvl >= 2 && lvl < 20 ? 2 : 0, true);
      break;
    case 'Fighter':
      add('Second Wind', 1, true);
      add('Action Surge', byLevel(lvl, [[2, 1], [17, 2]]), true);
      break;
    case 'Monk':
      add('Ki', lvl >= 2 ? lvl : 0, true);
      break;
    case 'Paladin':
      add('Lay on Hands (HP pool)', 5 * lvl);
      add('Divine Sense', 1 + Math.max(0, cha));
      break;
    case 'Sorcerer':
      add('Sorcery Points', lvl >= 2 ? lvl : 0);
      break;
    case 'Warlock':
      add('Pact Magic slots', byLevel(lvl, [[1, 1], [2, 2], [11, 3], [17, 4]]), true);
      break;
    default:
      break;
  }
  const caster = CLASS_INFO[className]?.caster;
  const casterLevel = caster === 'full' ? lvl : caster === 'half' && lvl >= 2 ? Math.ceil(lvl / 2) : 0;
  for (const slot of slotResources(casterLevel)) add(slot.label, slot.max);
  return out;
}

// The line of class basics the builder writes into Features, so the
// sheet says where the numbers came from.
export function classBasics(className, hitDie, level) {
  const info = CLASS_INFO[className];
  const lvl = Math.max(1, Math.min(20, Number(level) || 1));
  const parts = [`Hit Dice: ${lvl}d${hitDie}`];
  if (info) parts.push(`Saving throws: ${info.saves.map((k) => ABILITY_NAMES[k]).join(', ')}`);
  parts.push(`Proficiency bonus: +${Math.ceil(lvl / 4) + 1}`);
  return `${parts.join(' · ')}.`;
}

// A nudge when a personality box is blank — not rules text, just
// prompts to riff on.
export const INSPIRATION = {
  personalityTraits: [
    'I name every weapon I own and talk to them before a fight.',
    'I keep a tally of every favor owed to me — and every one I owe.',
    'I laugh at exactly the wrong moments.',
    'I collect a small stone from every place I sleep.',
    'I trust animals more than people, and it shows.',
    'I never sit with my back to a door.',
    'I hum old tavern songs when I am nervous.',
    'I over-prepare for everything and still forget the rope.',
  ],
  ideals: [
    'Freedom. No chain, law or debt should hold a person forever.',
    'Craft. Anything worth doing is worth doing beautifully.',
    'Loyalty. I stand by my companions, right or wrong.',
    'Knowledge. Every locked door hides something worth learning.',
    'Redemption. Anyone can change — even me.',
    'Glory. I want songs sung about me long after I am gone.',
  ],
  bonds: [
    'My sibling vanished on the road north. I still look for them in every crowd.',
    'I owe my life to a stranger whose face I never saw.',
    'The village that raised me is in danger, and only I know why.',
    'I carry a letter I have never had the courage to open.',
    'My old mentor was framed, and I will clear their name.',
    'Someone stole the one thing my family ever owned. I want it back.',
  ],
  flaws: [
    'I can never resist a wager, however bad the odds.',
    'I lie about small things out of habit.',
    'Once I pick a grudge, I never put it down.',
    'I assume the worst of anyone in fine clothes.',
    'Shiny things find their way into my pockets.',
    'I freeze when someone I care about is in danger.',
  ],
};

export function inspire(field, current) {
  const options = INSPIRATION[field].filter((o) => o !== current);
  return options[rollDie(options.length) - 1];
}
