// Client-side "keep it offline" export — BIBLE.md §6. Every content type
// gets its own toMarkdown() serializer (see encyclopedia.js/bestiary.js/
// notes.js); this just turns a string into a downloaded file, no server
// round-trip needed since the client already has the data.
export function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'untitled';
}
