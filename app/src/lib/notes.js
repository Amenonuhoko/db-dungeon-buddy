import { createLocalStore, createSupabaseStore } from './contentStore';

const local = createLocalStore('notes');
const remote = createSupabaseStore('notes');
const storeFor = (status) => (status === 'guest' ? local : remote);

export const VISIBILITIES = [
  { id: 'private', label: 'Just Me' },
  { id: 'dm', label: 'Shared with DM' },
  { id: 'campaign', label: 'Whole Campaign' },
];

// Reference samples — not stored anywhere, shown in an "Examples" panel
// and usable as a one-click starting point (see NotesScreen.jsx's "Use
// as Template"). One recap shape, one private-DM-secret shape, since
// those are the two notes a table actually writes most.
export const EXAMPLES = [
  {
    title: 'Session 1 recap',
    visibility: 'campaign',
    body: 'What happened: the party sailed into Port Vessa and met the harbormaster.\n\nLoose threads: who does the harbormaster actually owe money to?\n\nFollow up next session: the ledger she mentioned.',
  },
  {
    title: "Secret: the harbormaster's debt",
    visibility: 'private',
    body: "She owes The Undertow, not a rival — reveal this if the party starts trusting her too fast.\n\nDrop the hook: a debt collector shows up mid-conversation if they linger in her office.",
  },
];

export function listNotes(status, campaignId) {
  return storeFor(status).list(campaignId);
}

// Account notes get `author_id` stamped server-side by a trigger (see
// db/migrations/002_world_building.sql) — a crafted request can't claim
// someone else's authorship, so the client never sends it. Guest notes
// have no server, so they get a fixed local marker instead.
export function createNote(status, campaignId, fields) {
  if (status === 'guest') {
    return local.create(campaignId, { ...fields, authorId: 'local', authorName: 'You' });
  }
  return remote.create(campaignId, fields);
}

export function updateNote(status, campaignId, id, patch) {
  return storeFor(status).update(campaignId, id, patch);
}

export function removeNote(status, campaignId, id) {
  return storeFor(status).remove(campaignId, id);
}

export function noteToMarkdown(note) {
  const visibility = VISIBILITIES.find((v) => v.id === note.visibility)?.label || note.visibility;
  return `# ${note.title}\n\n_${visibility}_\n\n${note.body}\n`;
}

export function notesToMarkdown(notes) {
  return notes.map(noteToMarkdown).join('\n---\n\n');
}
