import { createLocalStore, createSupabaseStore } from './contentStore';

const local = createLocalStore('encyclopedia');
const remote = createSupabaseStore('encyclopedia_entries');
const storeFor = (status) => (status === 'guest' ? local : remote);

export const CATEGORIES = [
  { id: 'location', label: 'Location' },
  { id: 'npc', label: 'NPC' },
  { id: 'faction', label: 'Faction' },
  { id: 'item', label: 'Item' },
  { id: 'lore', label: 'Lore' },
  { id: 'other', label: 'Other' },
];

// Reference samples, not stored anywhere — shown in an "Examples" panel
// and usable as a one-click starting point for a new entry (see
// EncyclopediaScreen.jsx's "Use as Template"). Deliberately short: enough
// to show the shape of a good entry (what it is, why the party cares,
// one hook), not a wall of lore to read past.
export const EXAMPLES = [
  {
    category: 'location',
    title: 'Port Vessa',
    body: "A smugglers' port town built into a sea cliff — half the buildings are condemned, and the other half don't ask questions.\n\nWhat the party notices first: the harbor smells like tar and low tide, and every conversation stops when a stranger walks in.\n\nHook: the harbormaster is three months behind on payments to whoever actually runs the docks.",
    tags: ['coastal', 'act one'],
  },
  {
    category: 'npc',
    title: 'Harbormaster Ilsevet Cray',
    body: "Runs the port's paperwork, owes the wrong people money, and will absolutely sell out the party if it clears her debt.\n\nWants: to leave town quietly, ideally with the ledger nobody knows she copied.\n\nSecret: that ledger names every smuggler crew working the coast — including the one she reports to.",
    tags: ['port vessa', 'quest giver'],
  },
  {
    category: 'faction',
    title: 'The Undertow',
    body: "A loose network of smugglers moving contraband along the coast — less an organization than a shared understanding not to rat each other out.\n\nLeadership: nobody claims to be in charge, which is the point.\n\nReach: every port town within three days' sail has at least one Undertow contact.",
    tags: ['smugglers', 'coastal'],
  },
];

export function listEntries(status, campaignId) {
  return storeFor(status).list(campaignId);
}

export function createEntry(status, campaignId, fields) {
  return storeFor(status).create(campaignId, fields);
}

export function updateEntry(status, campaignId, id, patch) {
  return storeFor(status).update(campaignId, id, patch);
}

export function removeEntry(status, campaignId, id) {
  return storeFor(status).remove(campaignId, id);
}

export function matchesQuery(entry, query) {
  if (!query.trim()) return true;
  const haystack = `${entry.title} ${entry.body} ${(entry.tags || []).join(' ')}`.toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}

export function entryToMarkdown(entry) {
  const category = CATEGORIES.find((c) => c.id === entry.category)?.label || entry.category;
  const tags = entry.tags?.length ? `\n\n*Tags: ${entry.tags.join(', ')}*` : '';
  return `# ${entry.title}\n\n_${category}_\n\n${entry.body}${tags}\n`;
}

export function entriesToMarkdown(entries, campaignName) {
  const header = `# ${campaignName} — Encyclopedia\n\n`;
  return header + entries.map(entryToMarkdown).join('\n---\n\n');
}
