import { useEffect, useState } from 'react';
import { BLANK_ABILITIES, BLANK_PICKS, customOptions, finalizeQuickFields, parseClassAndLevel, parseRace } from '../lib/characters.js';
import { explainPortraitError } from '../lib/portraits.js';
import {
  createRosterCharacter,
  deleteRosterCharacter,
  isMissingRoster,
  listRoster,
  removeRosterPortrait,
  saveRosterPortrait,
  updateRosterCharacter,
} from '../lib/roster.js';
import { CharacterBuilder, CreateModeSwitch } from './CharacterBuilder.jsx';
import { useCreateMode } from '../lib/createMode.js';
import { DeleteButton } from './DeleteButton.jsx';
import { Panel } from './ornament/Panel.jsx';
import { Portrait, PortraitPicker } from './Portrait.jsx';
import { QuickCharacterFields } from './QuickCharacterFields.jsx';

// My Characters — an account holder's own characters, kept outside any
// campaign (db/migrations/009_characters.sql). Bring one into a campaign
// from its "Choose your character" step; "Save to My Characters" on a
// campaign sheet copies progress back here. Quick fields only for now —
// the full sheet (abilities, gear, features) comes along with anything
// saved back from a campaign — or with the guided builder.
const BLANK_FORM = { name: '', maxHp: '', armorClass: '', currentHp: '' };

export function MyCharacters() {
  const [characters, setCharacters] = useState(null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null); // 'new' | roster id | null
  const [form, setForm] = useState(BLANK_FORM);
  const [picks, setPicks] = useState(BLANK_PICKS);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useCreateMode('guided');

  useEffect(() => {
    listRoster()
      .then(setCharacters)
      .catch((err) => {
        if (isMissingRoster(err)) setUnavailable(true);
        else setError(err.message);
        setCharacters([]);
      });
  }, []);

  function startNew() {
    setForm(BLANK_FORM);
    setPicks(BLANK_PICKS);
    setEditingId('new');
  }

  function startEdit(character) {
    setForm({ name: character.name, maxHp: character.maxHp ?? '', armorClass: character.armorClass ?? '', currentHp: '' });
    const custom = customOptions(characters);
    setPicks({ ...parseClassAndLevel(character.classAndLevel, custom.classes), ...parseRace(character.race, custom.races) });
    setEditingId(character.id);
  }

  async function save(event) {
    event.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const quick = finalizeQuickFields(form, picks);
      if (editingId === 'new') {
        const created = await createRosterCharacter({ ...quick, abilities: BLANK_ABILITIES });
        setCharacters((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      } else {
        const existing = characters.find((c) => c.id === editingId);
        const updated = await updateRosterCharacter(editingId, { ...existing, ...quick });
        if (updated) setCharacters((prev) => prev.map((c) => (c.id === editingId ? updated : c)));
      }
      setEditingId(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function createBuilt(fields) {
    setBusy(true);
    setError(null);
    try {
      const created = await createRosterCharacter(fields);
      setCharacters((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setEditingId(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const replace = (updated) => setCharacters((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));

  async function remove(character) {
    setError(null);
    try {
      await deleteRosterCharacter(character.id, character.portraitPath);
      setCharacters((prev) => prev.filter((c) => c.id !== character.id));
    } catch (err) {
      setError(err.message);
    }
  }

  if (unavailable) return null; // backend without 009 — nothing to show yet

  const form$ = (
    <form onSubmit={save} className="my-characters-form">
      <QuickCharacterFields
        form={form}
        setForm={setForm}
        picks={picks}
        setPicks={setPicks}
        extraClasses={customOptions(characters || []).classes}
        extraRaces={customOptions(characters || []).races}
      />
      <div style={{ display: 'flex', gap: '0.6rem' }}>
        <button className="btn btn-primary btn-small" type="submit" disabled={busy || !form.name.trim()}>
          {editingId === 'new' ? 'Add to My Characters' : 'Save'}
        </button>
        <button className="btn btn-ghost btn-small" type="button" onClick={() => setEditingId(null)}>
          Cancel
        </button>
      </div>
    </form>
  );

  return (
    <section className="my-characters" aria-label="My Characters">
      <div className="stash-section-head">
        <h3>My Characters</h3>
        {editingId === null && (
          <button type="button" className="btn btn-ghost btn-small" onClick={startNew}>
            + New Character
          </button>
        )}
      </div>
      <p className="hint-text" style={{ marginTop: 0 }}>
        Yours to bring into any campaign — pick one when you join a table.
      </p>
      {error && <p className="error-text">{error}</p>}
      {editingId === 'new' && (
        <Panel style={{ marginBottom: '0.75rem' }}>
          <CreateModeSwitch mode={mode} setMode={setMode} />
          {mode === 'guided' ? (
            <CharacterBuilder
              extraClasses={customOptions(characters || []).classes}
              extraRaces={customOptions(characters || []).races}
              busy={busy}
              submitLabel="Add to My Characters"
              onSubmit={createBuilt}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            form$
          )}
        </Panel>
      )}
      {characters === null && <p className="hint-text">Loading…</p>}
      {characters?.length === 0 && editingId !== 'new' && <p className="hint-text">No characters saved yet.</p>}
      <ul className="choose-list">
        {characters?.map((c) =>
          editingId === c.id ? (
            <li key={c.id}>
              <Panel>
                <PortraitPicker
                  path={c.portraitPath}
                  name={c.name}
                  size="md"
                  onSave={async (img, crop) => replace(await saveRosterPortrait(c, img, crop))}
                  onRemove={async () => replace(await removeRosterPortrait(c))}
                  describeError={explainPortraitError}
                />
                {form$}
              </Panel>
            </li>
          ) : (
            <li key={c.id} className="choose-card panel">
              <DeleteButton onConfirm={() => remove(c)} label={c.name} />
              <Portrait path={c.portraitPath} name={c.name} size="sm" />
              <div className="choose-card-text">
                <span className="choose-card-name">{c.name}</span>
                <span className="choose-card-sub">{[c.classAndLevel, c.race].filter(Boolean).join(' · ') || 'No class yet'}</span>
              </div>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => startEdit(c)}>
                Edit
              </button>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}
