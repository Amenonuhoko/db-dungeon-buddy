import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ExampleGallery } from '../components/ExampleGallery.jsx';
import { Panel } from '../components/ornament/Panel.jsx';
import {
  ABILITY_KEYS,
  addCondition,
  BLANK_ABILITIES,
  createSheet,
  EXAMPLES,
  listConditions,
  listSheets,
  LOCAL_PLAYER_ID,
  modifier,
  removeCondition,
  removeSheet,
  sheetsToMarkdown,
  sheetToMarkdown,
  updateSheet,
} from '../lib/characters.js';
import { listCampaignMembers } from '../lib/campaigns.js';
import { downloadTextFile, slugify } from '../lib/markdownExport.js';
import { useSession } from '../lib/SessionContext.jsx';

const BLANK_FORM = {
  name: '',
  classAndLevel: '',
  race: '',
  background: '',
  abilities: BLANK_ABILITIES,
  armorClass: '',
  maxHp: '',
  currentHp: '',
  speed: '30 ft.',
  equipment: '',
  features: '',
  playerId: '',
};

const BLANK_CONDITION = { label: '', note: '', visibleToParty: true };

export function CharactersScreen() {
  const { campaignId, isDM, isGuest } = useOutletContext();
  const { status, user } = useSession();

  const [sheets, setSheets] = useState([]);
  const [conditions, setConditions] = useState([]);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);

  const [conditionFormFor, setConditionFormFor] = useState(null);
  const [conditionForm, setConditionForm] = useState(BLANK_CONDITION);

  const canCreate = isDM || isGuest;

  useEffect(() => {
    setLoading(true);
    Promise.all([listSheets(status, campaignId), listConditions(status, campaignId)])
      .then(([s, c]) => {
        setSheets(s);
        setConditions(c);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    if (status === 'authenticated' && isDM) {
      listCampaignMembers(campaignId)
        .then((members) => setPlayers(members.filter((m) => m.role === 'player')))
        .catch(() => {});
    }
  }, [status, campaignId, isDM]);

  const conditionsByCharacterId = useMemo(() => {
    const map = {};
    for (const c of conditions) {
      (map[c.characterId] ||= []).push(c);
    }
    return map;
  }, [conditions]);

  function canEditSheet(sheet) {
    if (isDM || isGuest) return true;
    return status === 'authenticated' && sheet.playerId === user?.id;
  }

  function startCreate() {
    setEditingId(null);
    setForm({ ...BLANK_FORM, playerId: isGuest ? LOCAL_PLAYER_ID : '' });
    setShowForm(true);
  }

  function startEdit(sheet) {
    setEditingId(sheet.id);
    setForm({ ...BLANK_FORM, ...sheet, abilities: { ...BLANK_ABILITIES, ...sheet.abilities } });
    setShowForm(true);
  }

  function useTemplate(example) {
    setEditingId(null);
    setForm({
      ...BLANK_FORM,
      ...example,
      abilities: { ...BLANK_ABILITIES, ...example.abilities },
      playerId: isGuest ? LOCAL_PLAYER_ID : '',
    });
    setShowForm(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.name.trim() || !form.playerId) return;
    const fields = {
      ...form,
      name: form.name.trim(),
      armorClass: form.armorClass === '' ? null : Number(form.armorClass),
      maxHp: form.maxHp === '' ? null : Number(form.maxHp),
      currentHp: form.currentHp === '' ? null : Number(form.currentHp),
    };
    try {
      if (editingId) {
        const updated = await updateSheet(status, campaignId, editingId, fields);
        setSheets((prev) => prev.map((s) => (s.id === editingId ? updated : s)));
      } else {
        const created = await createSheet(status, campaignId, fields);
        setSheets((prev) => [created, ...prev]);
      }
      setShowForm(false);
      setForm(BLANK_FORM);
      setEditingId(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteSheet(id) {
    try {
      if (status === 'guest') {
        for (const c of conditions.filter((c) => c.characterId === id)) {
          await removeCondition(status, campaignId, c.id);
        }
      }
      await removeSheet(status, campaignId, id);
      setSheets((prev) => prev.filter((s) => s.id !== id));
      setConditions((prev) => prev.filter((c) => c.characterId !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAddCondition(event, sheetId) {
    event.preventDefault();
    if (!conditionForm.label.trim()) return;
    try {
      const created = await addCondition(status, campaignId, { ...conditionForm, characterId: sheetId });
      setConditions((prev) => [...prev, created]);
      setConditionFormFor(null);
      setConditionForm(BLANK_CONDITION);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRemoveCondition(id) {
    try {
      await removeCondition(status, campaignId, id);
      setConditions((prev) => prev.filter((c) => c.id !== id));
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
          onClick={() => downloadTextFile('characters.md', sheetsToMarkdown(sheets, conditionsByCharacterId, 'Campaign'))}
          disabled={sheets.length === 0}
        >
          Export Markdown
        </button>
        {canCreate && (
          <button className="btn btn-primary btn-small" type="button" onClick={startCreate}>
            Hand Out a Sheet
          </button>
        )}
      </div>

      {canCreate && (
        <ExampleGallery
          items={EXAMPLES}
          isEmpty={sheets.length === 0}
          onUseTemplate={useTemplate}
          renderItem={(example) => (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                <h3 style={{ fontSize: '1.05rem' }}>{example.name}</h3>
                <span className="chip">{example.classAndLevel}</span>
              </div>
              <p style={{ marginTop: '0.25rem', fontStyle: 'italic', fontSize: '0.85rem' }}>{example.race}</p>
              <p style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>{example.background}</p>
            </>
          )}
        />
      )}

      {showForm && canCreate && (
        <Panel style={{ marginBottom: '1.5rem' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p className="hint-text">
              Who are they, how do they fight, and what's one thing that makes them a person, not a stat block?
            </p>

            {!isGuest && !editingId && (
              <div className="field">
                <label htmlFor="sheetPlayer">Hand this sheet to</label>
                {players.length === 0 ? (
                  <p style={{ fontSize: '0.85rem' }}>
                    No players have joined this campaign yet — share your invite code first.
                  </p>
                ) : (
                  <select
                    id="sheetPlayer"
                    value={form.playerId}
                    onChange={(e) => setForm({ ...form, playerId: e.target.value })}
                  >
                    <option value="" disabled>
                      Choose a player…
                    </option>
                    {players.map((p) => (
                      <option key={p.userId} value={p.userId}>
                        {p.displayName}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <div className="field" style={{ flex: '2 1 200px' }}>
                <label htmlFor="charName">Name</label>
                <input
                  id="charName"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Mira Duskwalker"
                  autoFocus
                />
              </div>
              <div className="field" style={{ flex: '1 1 140px' }}>
                <label htmlFor="charClass">Class &amp; Level</label>
                <input
                  id="charClass"
                  value={form.classAndLevel}
                  onChange={(e) => setForm({ ...form, classAndLevel: e.target.value })}
                  placeholder="Rogue 3"
                />
              </div>
              <div className="field" style={{ flex: '1 1 140px' }}>
                <label htmlFor="charRace">Race / Species</label>
                <input id="charRace" value={form.race} onChange={(e) => setForm({ ...form, race: e.target.value })} />
              </div>
            </div>

            <div className="field">
              <label htmlFor="charBackground">Background</label>
              <input
                id="charBackground"
                value={form.background}
                onChange={(e) => setForm({ ...form, background: e.target.value })}
                placeholder="Criminal, Sage, Soldier…"
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <div className="field" style={{ flex: '1 1 100px' }}>
                <label htmlFor="charAC">Armor Class</label>
                <input id="charAC" type="number" value={form.armorClass} onChange={(e) => setForm({ ...form, armorClass: e.target.value })} />
              </div>
              <div className="field" style={{ flex: '1 1 100px' }}>
                <label htmlFor="charMaxHp">Max HP</label>
                <input id="charMaxHp" type="number" value={form.maxHp} onChange={(e) => setForm({ ...form, maxHp: e.target.value })} />
              </div>
              <div className="field" style={{ flex: '1 1 100px' }}>
                <label htmlFor="charCurrentHp">Current HP</label>
                <input id="charCurrentHp" type="number" value={form.currentHp} onChange={(e) => setForm({ ...form, currentHp: e.target.value })} />
              </div>
              <div className="field" style={{ flex: '1 1 140px' }}>
                <label htmlFor="charSpeed">Speed</label>
                <input id="charSpeed" value={form.speed} onChange={(e) => setForm({ ...form, speed: e.target.value })} />
              </div>
            </div>

            <div>
              <label style={{ fontFamily: 'var(--font-display)', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
                Ability Scores
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.5rem', marginTop: '0.5rem' }}>
                {ABILITY_KEYS.map((key) => (
                  <div key={key} className="field">
                    <label htmlFor={`charAbility-${key}`}>{key.toUpperCase()}</label>
                    <input
                      id={`charAbility-${key}`}
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
              <label htmlFor="charEquipment">Equipment</label>
              <textarea
                id="charEquipment"
                value={form.equipment}
                onChange={(e) => setForm({ ...form, equipment: e.target.value })}
                placeholder="Shortsword, leather armor, a pack that's seen better days."
                rows={2}
              />
            </div>
            <div className="field">
              <label htmlFor="charFeatures">Features &amp; Traits</label>
              <textarea
                id="charFeatures"
                value={form.features}
                onChange={(e) => setForm({ ...form, features: e.target.value })}
                placeholder="Sneak Attack, Cunning Action, a signature move players will remember."
                rows={2}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn btn-primary" type="submit" disabled={!form.playerId}>
                {editingId ? 'Save Changes' : 'Hand Out Sheet'}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </Panel>
      )}

      {loading && <p>Loading the roster…</p>}
      {!loading && sheets.length === 0 && (
        <p>{canCreate ? 'No sheets yet — hand out the first one.' : "You don't have a character sheet yet — ask your DM."}</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {sheets.map((sheet) => {
          const abilities = { ...BLANK_ABILITIES, ...sheet.abilities };
          const sheetConditions = conditionsByCharacterId[sheet.id] || [];
          return (
            <Panel key={sheet.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem' }}>
                <h3 style={{ fontSize: '1.1rem' }}>{sheet.name}</h3>
                {sheet.classAndLevel && <span className="chip">{sheet.classAndLevel}</span>}
              </div>
              <p style={{ marginTop: '0.25rem', fontStyle: 'italic' }}>
                {sheet.race}
                {sheet.background ? ` · ${sheet.background}` : ''}
              </p>
              <p style={{ marginTop: '0.5rem' }}>
                AC {sheet.armorClass ?? '—'} · HP {sheet.currentHp ?? '—'} / {sheet.maxHp ?? '—'} · Speed{' '}
                {sheet.speed || '—'}
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

              {sheet.equipment && (
                <p style={{ marginTop: '0.75rem', whiteSpace: 'pre-wrap' }}>
                  <strong>Equipment:</strong> {sheet.equipment}
                </p>
              )}
              {sheet.features && (
                <p style={{ marginTop: '0.5rem', whiteSpace: 'pre-wrap' }}>
                  <strong>Features:</strong> {sheet.features}
                </p>
              )}

              <div style={{ marginTop: '1rem' }}>
                <label style={{ fontFamily: 'var(--font-display)', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
                  Conditions
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {sheetConditions.length === 0 && <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>None.</span>}
                  {sheetConditions.map((c) => (
                    <span
                      key={c.id}
                      title={c.note || undefined}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        fontSize: '0.7rem',
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        padding: '0.25rem 0.6rem',
                        borderRadius: 999,
                        border: '1px solid var(--oxblood)',
                        color: 'var(--oxblood)',
                      }}
                    >
                      {c.label}
                      {c.visibleToParty === false && ' · hidden'}
                      {isDM && (
                        <button
                          type="button"
                          onClick={() => handleRemoveCondition(c.id)}
                          aria-label={`Remove ${c.label}`}
                          style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: '0.85rem', lineHeight: 1 }}
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                </div>

                {isDM && (
                  <div style={{ marginTop: '0.75rem' }}>
                    {conditionFormFor === sheet.id ? (
                      <form
                        onSubmit={(e) => handleAddCondition(e, sheet.id)}
                        style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}
                      >
                        <div className="field" style={{ flex: '1 1 140px' }}>
                          <label htmlFor={`condLabel-${sheet.id}`}>Label</label>
                          <input
                            id={`condLabel-${sheet.id}`}
                            value={conditionForm.label}
                            onChange={(e) => setConditionForm({ ...conditionForm, label: e.target.value })}
                            placeholder="Poisoned, Cursed…"
                            autoFocus
                          />
                        </div>
                        <div className="field" style={{ flex: '2 1 200px' }}>
                          <label htmlFor={`condNote-${sheet.id}`}>Note (optional)</label>
                          <input
                            id={`condNote-${sheet.id}`}
                            value={conditionForm.note}
                            onChange={(e) => setConditionForm({ ...conditionForm, note: e.target.value })}
                            placeholder="What it does, when it clears"
                          />
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                          <input
                            type="checkbox"
                            checked={conditionForm.visibleToParty}
                            onChange={(e) => setConditionForm({ ...conditionForm, visibleToParty: e.target.checked })}
                          />
                          Visible to party
                        </label>
                        <button className="btn btn-primary btn-small" type="submit">
                          Add
                        </button>
                        <button
                          className="btn btn-ghost btn-small"
                          type="button"
                          onClick={() => {
                            setConditionFormFor(null);
                            setConditionForm(BLANK_CONDITION);
                          }}
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <button
                        className="btn btn-ghost btn-small"
                        type="button"
                        onClick={() => {
                          setConditionFormFor(sheet.id);
                          setConditionForm(BLANK_CONDITION);
                        }}
                      >
                        + Add Condition
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button
                  className="btn btn-ghost btn-small"
                  type="button"
                  onClick={() => downloadTextFile(`${slugify(sheet.name)}.md`, sheetToMarkdown(sheet, sheetConditions))}
                >
                  Export
                </button>
                {canEditSheet(sheet) && (
                  <>
                    <button className="btn btn-ghost btn-small" type="button" onClick={() => startEdit(sheet)}>
                      Edit
                    </button>
                    <button className="btn btn-danger btn-small" type="button" onClick={() => handleDeleteSheet(sheet.id)}>
                      Delete
                    </button>
                  </>
                )}
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
