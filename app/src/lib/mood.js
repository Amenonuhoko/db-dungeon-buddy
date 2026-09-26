// A scene's atmosphere (017: scenes.mood) — one choice per group, laid
// over the picture by SceneMood.jsx. Groups stack: night + rain +
// torchlight is a scene.
export const MOOD_GROUPS = [
  {
    key: 'time',
    label: 'Time of day',
    options: [
      { id: 'dawn', name: 'Dawn' },
      { id: 'day', name: 'Day' },
      { id: 'dusk', name: 'Dusk' },
      { id: 'night', name: 'Night' },
    ],
  },
  {
    key: 'weather',
    label: 'Weather',
    options: [
      { id: 'rain', name: 'Rain' },
      { id: 'snow', name: 'Snow' },
      { id: 'fog', name: 'Fog' },
      { id: 'storm', name: 'Storm' },
    ],
  },
  {
    key: 'light',
    label: 'Light',
    options: [
      { id: 'firelight', name: 'Firelight' },
      { id: 'torchlight', name: 'Torchlight' },
      { id: 'darkness', name: 'Darkness' },
    ],
  },
  {
    key: 'magic',
    label: 'Magic & dread',
    options: [
      { id: 'eerie', name: 'Eerie green' },
      { id: 'blood-moon', name: 'Blood moon' },
      { id: 'holy', name: 'Holy light' },
      { id: 'portal', name: 'Portal' },
      { id: 'heartbeat', name: 'Heartbeat' },
    ],
  },
];

// One-tap combinations for the moments a DM reaches for most.
export const MOOD_PRESETS = [
  { id: 'clear', name: 'Clear', mood: {} },
  { id: 'cozy', name: 'Cozy inn', mood: { time: 'night', light: 'firelight' } },
  { id: 'stormy-night', name: 'Stormy night', mood: { time: 'night', weather: 'storm' } },
  { id: 'haunted', name: 'Haunted', mood: { time: 'night', weather: 'fog', magic: 'eerie' } },
  { id: 'deep-dungeon', name: 'Deep dungeon', mood: { light: 'torchlight' } },
  { id: 'pitch-black', name: 'Pitch black', mood: { light: 'darkness' } },
  { id: 'winter-road', name: 'Winter road', mood: { time: 'day', weather: 'snow' } },
  { id: 'misty-dawn', name: 'Misty dawn', mood: { time: 'dawn', weather: 'fog' } },
  { id: 'dread', name: 'Dread', mood: { time: 'dusk', magic: 'heartbeat' } },
  { id: 'blood-rite', name: 'Blood rite', mood: { magic: 'blood-moon' } },
  { id: 'sanctuary', name: 'Sanctuary', mood: { magic: 'holy' } },
  { id: 'rift', name: 'The rift opens', mood: { time: 'dusk', magic: 'portal', weather: 'storm' } },
];

const VALID = Object.fromEntries(MOOD_GROUPS.map((g) => [g.key, new Set(g.options.map((o) => o.id))]));

// The scene's mood with anything unknown dropped.
export function moodOf(scene) {
  const raw = scene?.mood && typeof scene.mood === 'object' ? scene.mood : {};
  return Object.fromEntries(Object.entries(raw).filter(([k, v]) => VALID[k]?.has(v)));
}

export const sameMood = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

export function moodName(mood) {
  const names = MOOD_GROUPS.flatMap((g) => g.options.filter((o) => mood[g.key] === o.id).map((o) => o.name));
  return names.length ? names.join(' · ') : 'Clear';
}
