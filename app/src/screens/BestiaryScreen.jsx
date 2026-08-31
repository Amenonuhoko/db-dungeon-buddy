import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { DeleteButton } from '../components/DeleteButton.jsx';
import { ExampleGallery } from '../components/ExampleGallery.jsx';
import { Panel } from '../components/ornament/Panel.jsx';
import {
  ABILITY_KEYS,
  BLANK_ABILITIES,
  createCreature,
  creatureToMarkdown,
  creaturesToMarkdown,
  EXAMPLES,
  listCreatures,
  modifier,
  removeCreature,
  updateCreature,
} from '../lib/bestiary.js';
import { downloadTextFile, slugify } from '../lib/markdownExport.js';
import { useSession } from '../lib/SessionContext.jsx';

const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];

const BLANK_FORM = {
  name: '',
  type: '',
  size: 'Medium',
  armorClass: '',
  hitPoints: '',
  hitDice: '',
  speed: '30 ft.',
  abilities: BLANK_ABILITIES,
  challengeRating: '',
  traits: '',
  actions: '',
  notes: '',
};

export function BestiaryScreen() {
  const { campaignId, isDM } = useOutletContext();
  const { status } = useSession();

  const [creatures, setCreatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    setLoading(true);
    listCreatures(status, campaignId)
      .then(setCreatures)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [status, campaignId]);

  function startCreate() {
    setEditingId(null);
    setForm(BLANK_FORM);
    setShowForm(true);
  }

  function startEdit(creature) {
    setEditingId(creature.id);
    setForm({ ...BLANK_FORM, ...creature, abilities: { ...BLANK_ABILITIES, ...creature.abilities } });
    setShowForm(true);
  }

  function useTemplate(example) {
    setEditingId(null);
    setForm({ ...BLANK_FORM, ...example, abilities: { ...BLANK_ABILITIES, ...example.abilities } });
    setShowForm(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.name.trim()) return;
    const fields = {
      ...form,
      name: form.name.trim(),
      armorClass: form.armorClass === '' ? null : Number(form.armorClass),
      hitPoints: form.hitPoints === '' ? null : Number(form.hitPoints),
    };
    try {
      if (editingId) {
        const updated = await updateCreature(status, campaignId, editingId, fields);
        setCreatures((prev) => prev.map((c) => (c.id === editingId ? updated : c)));
      } else {
        const created = await createCreature(status, campaignId, fields);
        setCreatures((prev) => [created, ...prev]);
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
      await removeCreature(status, campaignId, id);
      setCreatures((prev) => prev.filter((c) => c.id !== id));
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
          onClick={() => downloadTextFile('bestiary.md', creaturesToMarkdown(creatures, 'Campaign'))}
          disabled={creatures.length === 0}
        >
          Export Markdown
        </button>
        {isDM && (
          <button className="btn btn-primary btn-small" type="button" onClick={startCreate}>
            New Creature
          </button>
        )}
      </div>

      {isDM && (
        <ExampleGallery
          items={EXAMPLES}
          isEmpty={creatures.length === 0}
          onUseTemplate={useTemplate}
          renderItem={(example) => (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                <h3 style={{ fontSize: '1.05rem' }}>{example.name}</h3>
                <span className="chip">CR {example.challengeRating}</span>
              </div>
              <p style={{ marginTop: '0.25rem', fontStyle: 'italic', fontSize: '0.85rem' }}>
                {example.size} {example.type}
              </p>
              <p style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                AC {example.armorClass} · HP {example.hitPoints} ({example.hitDice}) · Speed {example.speed}
              </p>
            </>
          )}
        />
      )}

      {showForm && isDM && (
        <Panel style={{ marginBottom: '1.5rem' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p className="hint-text">
              How does it fight, what makes it dangerous, and what's the one detail players will remember?
            </p>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <div className="field" style={{ flex: '2 1 200px' }}>
                <label htmlFor="beastName">Name</label>
                <input
                  id="beastName"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Cliffside Ghoul"
                  autoFocus
                />
              </div>
              <div className="field" style={{ flex: '1 1 140px' }}>
                <label htmlFor="beastSize">Size</label>
                <select id="beastSize" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })}>
                  {SIZES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ flex: '1 1 140px' }}>
                <label htmlFor="beastType">Type</label>
                <input
                  id="beastType"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  placeholder="undead, beast, fiend…"
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <div className="field" style={{ flex: '1 1 100px' }}>
                <label htmlFor="beastAC">Armor Class</label>
                <input id="beastAC" type="number" value={form.armorClass} onChange={(e) => setForm({ ...form, armorClass: e.target.value })} />
              </div>
              <div className="field" style={{ flex: '1 1 100px' }}>
                <label htmlFor="beastHP">Hit Points</label>
                <input id="beastHP" type="number" value={form.hitPoints} onChange={(e) => setForm({ ...form, hitPoints: e.target.value })} />
              </div>
              <div className="field" style={{ flex: '1 1 140px' }}>
                <label htmlFor="beastHD">Hit Dice</label>
                <input id="beastHD" value={form.hitDice} onChange={(e) => setForm({ ...form, hitDice: e.target.value })} placeholder="6d8+12" />
              </div>
              <div className="field" style={{ flex: '1 1 160px' }}>
                <label htmlFor="beastSpeed">Speed</label>
                <input id="beastSpeed" value={form.speed} onChange={(e) => setForm({ ...form, speed: e.target.value })} />
              </div>
              <div className="field" style={{ flex: '1 1 100px' }}>
                <label htmlFor="beastCR">Challenge</label>
                <input
                  id="beastCR"
                  value={form.challengeRating}
                  onChange={(e) => setForm({ ...form, challengeRating: e.target.value })}
                  placeholder="1/4, 3…"
                />
              </div>
            </div>

            <div>
              <label style={{ fontFamily: 'var(--font-display)', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
                Ability Scores
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.5rem', marginTop: '0.5rem' }}>
                {ABILITY_KEYS.map((key) => (
                  <div key={key} className="field">
                    <label htmlFor={`ability-${key}`}>{key.toUpperCase()}</label>
                    <input
                      id={`ability-${key}`}
                      type="number"
                      value={form.abilities[key]}
                      onChange={(e) =>
                        setForm({ ...form, abilities: { ...form.abilities, [key]: Number(e.target.value) } })
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="field">
              <label htmlFor="beastTraits">Traits (passive abilities)</label>
              <textarea
                id="beastTraits"
                value={form.traits}
                onChange={(e) => setForm({ ...form, traits: e.target.value })}
                placeholder="Pack Tactics. Has advantage on an attack roll against a creature if an ally is within 5 ft. of it."
                rows={3}
              />
            </div>
            <div className="field">
              <label htmlFor="beastActions">Actions (what it does on its turn)</label>
              <textarea
                id="beastActions"
                value={form.actions}
                onChange={(e) => setForm({ ...form, actions: e.target.value })}
                placeholder="Claw. Melee Weapon Attack: +4 to hit, reach 5 ft. Hit: 2d6+2 slashing damage."
                rows={3}
              />
            </div>
            <div className="field">
              <label htmlFor="beastNotes">DM Notes (optional)</label>
              <textarea
                id="beastNotes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Where it lairs, what it wants, when to have it flee instead of fight."
                rows={2}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn btn-primary" type="submit">
                {editingId ? 'Save Changes' : 'Add Creature'}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </Panel>
      )}

      {loading && <p>Loading the bestiary…</p>}
      {!loading && creatures.length === 0 && (
        <p>{isDM ? 'No creatures yet — add the first one.' : 'The DM hasn’t added any creatures yet.'}</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {creatures.map((creature) => {
          const abilities = { ...BLANK_ABILITIES, ...creature.abilities };
          return (
            <Panel key={creature.id}>
              {isDM && <DeleteButton onConfirm={() => handleDelete(creature.id)} label={creature.name} />}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem' }}>
                <h3 style={{ fontSize: '1.1rem' }}>{creature.name}</h3>
                {creature.challengeRating && <span className="chip">CR {creature.challengeRating}</span>}
              </div>
              <p style={{ marginTop: '0.25rem', fontStyle: 'italic' }}>
                {creature.size} {creature.type}
              </p>
              <p style={{ marginTop: '0.5rem' }}>
                AC {creature.armorClass ?? '—'} · HP {creature.hitPoints ?? '—'}
                {creature.hitDice ? ` (${creature.hitDice})` : ''} · Speed {creature.speed || '—'}
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(6, 1fr)',
                  gap: '0.5rem',
                  marginTop: '0.75rem',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.85rem',
                  textAlign: 'center',
                }}
              >
                {ABILITY_KEYS.map((key) => (
                  <div key={key}>
                    <div style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>{key.toUpperCase()}</div>
                    <div>
                      {abilities[key]} ({modifier(abilities[key])})
                    </div>
                  </div>
                ))}
              </div>
              {creature.traits && (
                <p style={{ marginTop: '0.75rem', whiteSpace: 'pre-wrap' }}>
                  <strong>Traits:</strong> {creature.traits}
                </p>
              )}
              {creature.actions && (
                <p style={{ marginTop: '0.5rem', whiteSpace: 'pre-wrap' }}>
                  <strong>Actions:</strong> {creature.actions}
                </p>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button
                  className="btn btn-ghost btn-small"
                  type="button"
                  onClick={() => downloadTextFile(`${slugify(creature.name)}.md`, creatureToMarkdown(creature))}
                >
                  Export
                </button>
                {isDM && (
                  <button className="btn btn-ghost btn-small" type="button" onClick={() => startEdit(creature)}>
                    Edit
                  </button>
                )}
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
