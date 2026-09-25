import { createCreature } from './bestiary.js';
import { createCampaign, createGuestCampaign } from './campaigns.js';
import { createEntry } from './encyclopedia.js';
import { createNote } from './notes.js';

// Calls app/api/generate-campaign.js — the only place this app talks to
// Claude, since generation needs a secret API key the browser must never
// hold (BIBLE.md §5/§7). Returns a "campaign seed": one campaign plus
// arrays of encyclopedia/bestiary/note rows, already shaped to match
// what createEntry()/createCreature()/createNote() expect.
export async function generateCampaignSeed(params) {
  const res = await fetch('/api/generate-campaign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || "Couldn't generate a campaign — try again in a moment.");
  }
  return data;
}

// Turns a generated seed into a real campaign — one insert per row,
// through the exact same guest/account-aware functions the manual "New
// Entry" forms already use. An AI-authored entry is indistinguishable
// from a hand-typed one afterward: same storage (localStorage or
// Supabase), same RLS, same edit/delete/export behavior — this function
// does nothing a DM couldn't do by hand, just faster.
export async function importCampaignSeed(status, guestRole, seed) {
  const campaign =
    status === 'guest'
      ? createGuestCampaign(seed.campaign.name, guestRole)
      : await createCampaign(seed.campaign.name, seed.campaign.description);
  const campaignId = campaign.id;

  for (const entry of seed.encyclopediaEntries) {
    await createEntry(status, campaignId, entry);
  }
  for (const creature of seed.bestiaryEntries) {
    await createCreature(status, campaignId, creature);
  }
  for (const note of seed.notes) {
    await createNote(status, campaignId, note);
  }

  return campaign;
}
