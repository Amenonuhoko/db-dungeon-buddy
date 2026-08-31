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
