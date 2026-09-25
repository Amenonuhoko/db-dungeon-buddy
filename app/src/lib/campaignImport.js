import { createCreature } from './bestiary.js';
import { createCampaign, createGuestCampaign } from './campaigns.js';
import { CATEGORIES, createEntry } from './encyclopedia.js';
import { createNote, VISIBILITIES } from './notes.js';

const CATEGORY_IDS = CATEGORIES.map((c) => c.id);
const VISIBILITY_IDS = VISIBILITIES.map((v) => v.id);
const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

// Validates a parsed campaign-template file (see
// campaign-template.example.json at the repo root) before anything
// touches storage — a malformed file should fail with one plain message
// up front, not a half-imported campaign followed by a raw error on
// entry #6. Not exhaustive type-checking, just enough to catch a wrong
// shape early. Returns an error string, or null if the file looks
// usable.
export function validateCampaignTemplate(data) {
  if (!data || typeof data !== 'object') return "That doesn't look like a campaign file — not a JSON object.";
  if (!data.campaign?.name?.trim()) return 'Missing campaign.name.';

  for (const key of ['encyclopediaEntries', 'bestiaryEntries', 'notes']) {
    if (data[key] !== undefined && !Array.isArray(data[key])) return `"${key}" must be a list.`;
  }

  for (const entry of data.encyclopediaEntries ?? []) {
    if (!entry.title?.trim()) return 'An encyclopedia entry is missing a title.';
    if (!CATEGORY_IDS.includes(entry.category)) {
      return `"${entry.title}" has an invalid category "${entry.category}" — must be one of ${CATEGORY_IDS.join(', ')}.`;
    }
  }

  for (const creature of data.bestiaryEntries ?? []) {
    if (!creature.name?.trim()) return 'A bestiary entry is missing a name.';
    if (creature.abilities && ABILITY_KEYS.some((key) => typeof creature.abilities[key] !== 'number')) {
      return `"${creature.name}" is missing one of its six ability scores (str/dex/con/int/wis/cha).`;
    }
  }

  for (const note of data.notes ?? []) {
    if (note.visibility && !VISIBILITY_IDS.includes(note.visibility)) {
      return `"${note.title || 'A note'}" has an invalid visibility "${note.visibility}" — must be one of ${VISIBILITY_IDS.join(', ')}.`;
    }
  }

  return null;
}

// Creates the campaign and every row inside it through the exact same
// guest/account-aware functions the manual "New Entry" forms already
// use (lib/campaigns.js, lib/encyclopedia.js, lib/bestiary.js,
// lib/notes.js) — an imported entry is indistinguishable from a
// hand-typed one afterward: same storage, same RLS, same edit/delete/
// export behavior.
export async function importCampaignTemplate(status, guestRole, data) {
  const campaign =
    status === 'guest'
      ? createGuestCampaign(data.campaign.name, guestRole)
      : await createCampaign(data.campaign.name, data.campaign.description || '');
  const campaignId = campaign.id;

  for (const entry of data.encyclopediaEntries ?? []) {
    await createEntry(status, campaignId, {
      category: entry.category,
      title: entry.title,
      body: entry.body || '',
      tags: entry.tags || [],
    });
  }
  for (const creature of data.bestiaryEntries ?? []) {
    await createCreature(status, campaignId, creature);
  }
  for (const note of data.notes ?? []) {
    await createNote(status, campaignId, note);
  }

  return campaign;
}
