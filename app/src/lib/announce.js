// The DM's announcements (017): ready-made calls and title cards, plus the
// DM's own saved calls — kept on this device, per campaign (the key ends
// in the campaign id, so deleting an offline campaign clears them too).

export const PRESET_CALLS = [
  'Roll initiative!',
  'Make a Perception check.',
  'Everyone, a saving throw.',
  'Roll for Stealth.',
  'You hear footsteps…',
  'Something moves in the shadows…',
  'A cold wind blows through.',
  'Take a short rest.',
  'Take a long rest.',
  'Roll an Insight check.',
];

export const PRESET_TITLES = [
  { text: 'Meanwhile…' },
  { text: 'Three days later…' },
  { text: 'Night falls' },
  { text: 'Dawn breaks' },
  { text: 'Chapter One', body: 'The journey begins' },
  { text: 'Chapter Two' },
  { text: 'To be continued…' },
];

const key = (campaignId) => `dungeonbuddy.callPresets.${campaignId}`;

export function readCustomCalls(campaignId) {
  try {
    const list = JSON.parse(localStorage.getItem(key(campaignId)) || '[]');
    return Array.isArray(list) ? list.filter((t) => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

export function writeCustomCalls(campaignId, list) {
  try {
    localStorage.setItem(key(campaignId), JSON.stringify(list.slice(0, 40)));
  } catch {
    /* storage blocked — the presets just won't stick */
  }
}
