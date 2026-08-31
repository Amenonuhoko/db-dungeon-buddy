import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { DeleteButton } from '../components/DeleteButton.jsx';
import { ExampleGallery } from '../components/ExampleGallery.jsx';
import { Panel } from '../components/ornament/Panel.jsx';
import { downloadTextFile } from '../lib/markdownExport.js';
import { createNote, EXAMPLES, listNotes, noteToMarkdown, notesToMarkdown, removeNote, updateNote, VISIBILITIES } from '../lib/notes.js';
import { useSession } from '../lib/SessionContext.jsx';

const BLANK_FORM = { title: '', body: '', visibility: 'private' };

export function NotesScreen() {
  const { campaignId, isGuest } = useOutletContext();
  const { status, user } = useSession();

  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    setLoading(true);
    listNotes(status, campaignId)
      .then(setNotes)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [status, campaignId]);

  function isMine(note) {
    return isGuest || note.authorId === user?.id;
  }

  function startCreate() {
    setEditingId(null);
    setForm(BLANK_FORM);
    setShowForm(true);
  }

  function startEdit(note) {
    setEditingId(note.id);
    setForm({ title: note.title, body: note.body, visibility: note.visibility });
    setShowForm(true);
  }

  function useTemplate(example) {
    setEditingId(null);
    setForm({ title: example.title, body: example.body, visibility: example.visibility });
    setShowForm(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.title.trim() || !form.body.trim()) return;
    const fields = { title: form.title.trim(), body: form.body.trim(), visibility: form.visibility };
    try {
      if (editingId) {
        const updated = await updateNote(status, campaignId, editingId, fields);
        setNotes((prev) => prev.map((n) => (n.id === editingId ? updated : n)));
      } else {
        const created = await createNote(status, campaignId, fields);
        setNotes((prev) => [created, ...prev]);
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
      await removeNote(status, campaignId, id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      {error && <p className="error-text" style={{ marginBottom: '1rem' }}>{error}</p>}

      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
        <button
          className="btn btn-ghost btn-small"
          type="button"
          onClick={() => downloadTextFile('notes.md', notesToMarkdown(notes))}
          disabled={notes.length === 0}
        >
          Export Markdown
        </button>
        <button className="btn btn-primary btn-small" type="button" onClick={startCreate}>
          New Note
        </button>
      </div>

      <ExampleGallery
        items={EXAMPLES}
        isEmpty={notes.length === 0}
        onUseTemplate={useTemplate}
        renderItem={(example) => (
          <>
            <h3 style={{ fontSize: '1.05rem' }}>{example.title}</h3>
            <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{example.body}</p>
          </>
        )}
      />

      {showForm && (
        <Panel style={{ marginBottom: '1.5rem' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p className="hint-text">Recap what happened, what's unresolved, and who to follow up with.</p>
            <div className="field">
              <label htmlFor="noteTitle">Title</label>
              <input
                id="noteTitle"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Session 4 recap"
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="noteBody">Body</label>
              <textarea
                id="noteBody"
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="What happened, what's still unresolved, who to follow up with."
                rows={6}
              />
            </div>
            {!isGuest && (
              <div className="field">
                <label htmlFor="noteVisibility">Who can see this</label>
                <select
                  id="noteVisibility"
                  value={form.visibility}
                  onChange={(e) => setForm({ ...form, visibility: e.target.value })}
                >
                  {VISIBILITIES.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn btn-primary" type="submit">
                {editingId ? 'Save Changes' : 'Add Note'}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </Panel>
      )}

      {loading && <p>Loading notes…</p>}
      {!loading && notes.length === 0 && <p>No notes yet.</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {notes.map((note) => (
          <Panel key={note.id}>
            {isMine(note) && <DeleteButton onConfirm={() => handleDelete(note.id)} label={note.title} />}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem' }}>
              <h3 style={{ fontSize: '1.1rem' }}>{note.title}</h3>
              {!isGuest && (
                <span className="chip">{VISIBILITIES.find((v) => v.id === note.visibility)?.label}</span>
              )}
            </div>
            <p style={{ marginTop: '0.75rem', whiteSpace: 'pre-wrap' }}>{note.body}</p>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button
                className="btn btn-ghost btn-small"
                type="button"
                onClick={() => downloadTextFile(`${note.title || 'note'}.md`, noteToMarkdown(note))}
              >
                Export
              </button>
              {isMine(note) && (
                <button className="btn btn-ghost btn-small" type="button" onClick={() => startEdit(note)}>
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
