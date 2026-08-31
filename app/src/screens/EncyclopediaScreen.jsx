import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { DeleteButton } from '../components/DeleteButton.jsx';
import { ExampleGallery } from '../components/ExampleGallery.jsx';
import { Panel } from '../components/ornament/Panel.jsx';
import {
  CATEGORIES,
  createEntry,
  entriesToMarkdown,
  entryToMarkdown,
  EXAMPLES,
  listEntries,
  matchesQuery,
  removeEntry,
  updateEntry,
} from '../lib/encyclopedia.js';
import { downloadTextFile, slugify } from '../lib/markdownExport.js';
import { useSession } from '../lib/SessionContext.jsx';

const BLANK_FORM = { category: 'location', title: '', body: '', tags: '' };

export function EncyclopediaScreen() {
  const { campaignId, isDM } = useOutletContext();
  const { status } = useSession();

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    setLoading(true);
    listEntries(status, campaignId)
      .then(setEntries)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [status, campaignId]);

  const filtered = useMemo(
    () =>
      entries
        .filter((e) => categoryFilter === 'all' || e.category === categoryFilter)
        .filter((e) => matchesQuery(e, query)),
    [entries, categoryFilter, query],
  );

  function startCreate() {
    setEditingId(null);
    setForm(BLANK_FORM);
    setShowForm(true);
  }

  function startEdit(entry) {
    setEditingId(entry.id);
    setForm({ category: entry.category, title: entry.title, body: entry.body, tags: (entry.tags || []).join(', ') });
    setShowForm(true);
  }

  function useTemplate(example) {
    setEditingId(null);
    setForm({ category: example.category, title: example.title, body: example.body, tags: example.tags.join(', ') });
    setShowForm(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.title.trim() || !form.body.trim()) return;
    const fields = {
      category: form.category,
      title: form.title.trim(),
      body: form.body.trim(),
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };
    try {
      if (editingId) {
        const updated = await updateEntry(status, campaignId, editingId, fields);
        setEntries((prev) => prev.map((e) => (e.id === editingId ? updated : e)));
      } else {
        const created = await createEntry(status, campaignId, fields);
        setEntries((prev) => [created, ...prev]);
      }
      setShowForm(false);
      setForm(BLANK_FORM);
      setEditingId(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id) {
    try {
      await removeEntry(status, campaignId, id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  function exportOne(entry) {
    downloadTextFile(`${slugify(entry.title)}.md`, entryToMarkdown(entry));
  }

  function exportAll() {
    downloadTextFile('encyclopedia.md', entriesToMarkdown(filtered, 'Campaign'));
  }

  const canWrite = isDM;

  return (
    <div>
      {error && <p className="error-text" style={{ marginBottom: '1rem' }}>{error}</p>}

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the codex…"
          style={{
            flex: '1 1 200px',
            background: 'var(--surface-raised)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius)',
            color: 'var(--text)',
            padding: '0.6rem 0.9rem',
          }}
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          style={{
            background: 'var(--surface-raised)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius)',
            color: 'var(--text)',
            padding: '0.6rem 0.9rem',
          }}
        >
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <button className="btn btn-ghost btn-small" type="button" onClick={exportAll} disabled={filtered.length === 0}>
          Export Markdown
        </button>
        {canWrite && (
          <button className="btn btn-primary btn-small" type="button" onClick={startCreate}>
            New Entry
          </button>
        )}
      </div>

      {canWrite && (
        <ExampleGallery
          items={EXAMPLES}
          isEmpty={entries.length === 0}
          onUseTemplate={useTemplate}
          renderItem={(example) => (
            <>
              <h3 style={{ fontSize: '1.05rem' }}>{example.title}</h3>
              <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{example.body}</p>
            </>
          )}
        />
      )}

      {showForm && canWrite && (
        <Panel style={{ marginBottom: '1.5rem' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p className="hint-text">
              What is it, why does the party care, and what's one secret or hook a DM can drop in mid-scene?
            </p>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <div className="field" style={{ flex: '2 1 200px' }}>
                <label htmlFor="entryTitle">Title</label>
                <input
                  id="entryTitle"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Port Vessa"
                  autoFocus
                />
              </div>
              <div className="field" style={{ flex: '1 1 140px' }}>
                <label htmlFor="entryCategory">Category</label>
                <select
                  id="entryCategory"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="entryBody">Body</label>
              <textarea
                id="entryBody"
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="What the party notices first. What it wants or hides. One hook a DM can drop in."
                rows={6}
              />
            </div>
            <div className="field">
              <label htmlFor="entryTags">Tags (comma separated)</label>
              <input
                id="entryTags"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="port city, smugglers, act one"
              />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn btn-primary" type="submit">
                {editingId ? 'Save Changes' : 'Add Entry'}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </Panel>
      )}

      {loading && <p>Loading the codex…</p>}
      {!loading && filtered.length === 0 && (
        <p>
          {entries.length === 0
            ? canWrite
              ? 'Nothing written yet — add the first entry.'
              : 'The DM hasn’t written anything here yet.'
            : 'Nothing matches that search.'}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {filtered.map((entry) => (
          <Panel key={entry.id}>
            {canWrite && <DeleteButton onConfirm={() => handleDelete(entry.id)} label={entry.title} />}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem' }}>
              <h3 style={{ fontSize: '1.1rem' }}>{entry.title}</h3>
              <span className="chip">{CATEGORIES.find((c) => c.id === entry.category)?.label}</span>
            </div>
            <p style={{ marginTop: '0.75rem', whiteSpace: 'pre-wrap' }}>{entry.body}</p>
            {entry.tags?.length > 0 && (
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                {entry.tags.map((tag) => (
                  <span key={tag} className="chip">
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button className="btn btn-ghost btn-small" type="button" onClick={() => exportOne(entry)}>
                Export
              </button>
              {canWrite && (
                <button className="btn btn-ghost btn-small" type="button" onClick={() => startEdit(entry)}>
                  Edit
                </button>
              )}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
