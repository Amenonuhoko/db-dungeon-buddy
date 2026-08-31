import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BackButton } from '../components/BackButton.jsx';
import { DeleteButton } from '../components/DeleteButton.jsx';
import { LaurelFlourish } from '../components/ornament/Laurel.jsx';
import {
  ABILITY_KEYS,
  addCondition,
  BLANK_ABILITIES,
  listConditions,
  listSheets,
  LOCAL_PLAYER_ID,
  modifier,
  removeCondition,
  removeSheet,
  sheetToMarkdown,
  updateSheet,
} from '../lib/characters.js';
import { downloadTextFile, slugify } from '../lib/markdownExport.js';
import { useCampaignAccess } from '../lib/useCampaignAccess.js';
import { useSession } from '../lib/SessionContext.jsx';

const BLANK_CONDITION = { label: '', note: '', visibleToParty: true };

// The hexagonal ability/stat plate — the one piece of this screen's
// vocabulary that isn't borrowed from the rest of the app (which is all
// rounded panels and pill chips). Two nested clip-path hexagons (gold
// outer, surface-colored inner) fake a beveled border clip-path alone
// can't draw. See index.css's .stat-hex block for the shape.
function StatHex({ label, value, sub, big }) {
  return (
    <div className={`stat-hex${big ? ' stat-hex-big' : ''}`}>
      <div className="stat-hex-inner">
        <span className="stat-hex-label">{label}</span>
        <span className="stat-hex-value">{value}</span>
        {sub != null && <span className="stat-hex-sub">{sub}</span>}
      </div>
    </div>
  );
}

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
};

export function CharacterSheetScreen() {
  const { campaignId, sheetId } = useParams();
  const navigate = useNavigate();
  const { status, user } = useSession();
  const { isDM, isGuest, loading: campaignLoading, error: campaignError } = useCampaignAccess(campaignId);

  const [sheets, setSheets] = useState([]);
  const [conditions, setConditions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);

  const [hpDelta, setHpDelta] = useState('');

  const [conditionOpen, setConditionOpen] = useState(false);
  const [conditionForm, setConditionForm] = useState(BLANK_CONDITION);

  useEffect(() => {
    setLoading(true);
    Promise.all([listSheets(status, campaignId), listConditions(status, campaignId)])
      .then(([s, c]) => {
        setSheets(s);
        setConditions(c);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [status, campaignId]);

  const sheet = sheets.find((s) => s.id === sheetId);
  const sheetConditions = conditions.filter((c) => c.characterId === sheetId);

  function canEdit() {
    if (!sheet) return false;
    if (isDM) return true;
    if (isGuest) return sheet.playerId === LOCAL_PLAYER_ID;
    return status === 'authenticated' && sheet.playerId === user?.id;
  }

  function startEditing() {
    setForm({ ...BLANK_FORM, ...sheet, abilities: { ...BLANK_ABILITIES, ...sheet.abilities } });
    setEditing(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.name.trim()) return;
    const fields = {
      ...form,
      name: form.name.trim(),
      armorClass: form.armorClass === '' ? null : Number(form.armorClass),
      maxHp: form.maxHp === '' ? null : Number(form.maxHp),
      currentHp: form.currentHp === '' ? null : Number(form.currentHp),
    };
    try {
      const updated = await updateSheet(status, campaignId, sheet.id, fields);
      setSheets((prev) => prev.map((s) => (s.id === sheet.id ? updated : s)));
      setEditing(false);
    } catch (err) {
      setError(err.message);
    }
  }

  async function applyHpDelta(sign) {
    const amount = (Math.abs(Number(hpDelta)) || 1) * sign;
    const max = sheet.maxHp ?? Infinity;
    const next = Math.max(0, Math.min(max, (sheet.currentHp ?? 0) + amount));
    try {
      const updated = await updateSheet(status, campaignId, sheet.id, { currentHp: next });
      setSheets((prev) => prev.map((s) => (s.id === sheet.id ? updated : s)));
      setHpDelta('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete() {
    try {
      if (status === 'guest') {
        for (const c of sheetConditions) {
          await removeCondition(status, campaignId, c.id);
        }
      }
      await removeSheet(status, campaignId, sheet.id);
      navigate(`/campaigns/${campaignId}/characters`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAddCondition(event) {
    event.preventDefault();
    if (!conditionForm.label.trim()) return;
    try {
      const created = await addCondition(status, campaignId, { ...conditionForm, characterId: sheet.id });
      setConditions((prev) => [...prev, created]);
      setConditionOpen(false);
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

  function exportSheet() {
    downloadTextFile(`${slugify(sheet.name)}.md`, sheetToMarkdown(sheet, sheetConditions));
  }

  const rosterPath = `/campaigns/${campaignId}/characters`;

  if (campaignError || error) {
    return (
      <div className="character-sheet-screen">
        <div className="character-sheet-shell" style={{ textAlign: 'center', paddingTop: '4rem' }}>
          <p className="error-text">{campaignError || error}</p>
          <div style={{ marginTop: '1rem' }}>
            <BackButton to={rosterPath} label="Roster" />
          </div>
        </div>
      </div>
    );
  }

  if (campaignLoading || loading) {
    return (
      <div className="character-sheet-screen">
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
          <p style={{ fontFamily: 'var(--font-display)', color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
            UNROLLING THE SHEET…
          </p>
        </div>
      </div>
    );
  }

  if (!sheet) {
    return (
      <div className="character-sheet-screen">
        <div className="character-sheet-shell" style={{ textAlign: 'center', paddingTop: '4rem' }}>
          <p>That character sheet doesn't exist here.</p>
          <div style={{ marginTop: '1rem' }}>
            <BackButton to={rosterPath} label="Roster" />
          </div>
        </div>
      </div>
    );
  }

  const abilities = { ...BLANK_ABILITIES, ...sheet.abilities };
  const hpPct = sheet.maxHp ? Math.max(0, Math.min(100, ((sheet.currentHp ?? 0) / sheet.maxHp) * 100)) : 0;
  const hpBand = hpPct > 50 ? 'ok' : hpPct > 25 ? 'warn' : 'danger';
  const editable = canEdit();

  return (
    <div className="character-sheet-screen screen-enter">
      <div className="character-sheet-shell">
        <BackButton to={rosterPath} label="Roster" />

        <div className="character-sheet-plate corner-frame">
          {editable && !editing && <DeleteButton onConfirm={handleDelete} label={sheet.name} />}

          {editing ? (
            <form onSubmit={handleSubmit} className="character-sheet-form">
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <div className="field" style={{ flex: '2 1 220px' }}>
                  <label htmlFor="csName">Name</label>
                  <input
                    id="csName"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    autoFocus
                  />
                </div>
                <div className="field" style={{ flex: '1 1 140px' }}>
                  <label htmlFor="csClass">Class &amp; Level</label>
                  <input
                    id="csClass"
                    value={form.classAndLevel}
                    onChange={(e) => setForm({ ...form, classAndLevel: e.target.value })}
                  />
                </div>
                <div className="field" style={{ flex: '1 1 140px' }}>
                  <label htmlFor="csRace">Race / Species</label>
                  <input id="csRace" value={form.race} onChange={(e) => setForm({ ...form, race: e.target.value })} />
                </div>
              </div>

              <div className="field">
                <label htmlFor="csBackground">Background</label>
                <input
                  id="csBackground"
                  value={form.background}
                  onChange={(e) => setForm({ ...form, background: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <div className="field" style={{ flex: '1 1 100px' }}>
                  <label htmlFor="csAC">Armor Class</label>
                  <input
                    id="csAC"
                    type="number"
                    value={form.armorClass}
                    onChange={(e) => setForm({ ...form, armorClass: e.target.value })}
                  />
                </div>
                <div className="field" style={{ flex: '1 1 100px' }}>
                  <label htmlFor="csMaxHp">Max HP</label>
                  <input
                    id="csMaxHp"
                    type="number"
                    value={form.maxHp}
                    onChange={(e) => setForm({ ...form, maxHp: e.target.value })}
                  />
                </div>
                <div className="field" style={{ flex: '1 1 100px' }}>
                  <label htmlFor="csCurrentHp">Current HP</label>
                  <input
                    id="csCurrentHp"
                    type="number"
                    value={form.currentHp}
                    onChange={(e) => setForm({ ...form, currentHp: e.target.value })}
                  />
                </div>
                <div className="field" style={{ flex: '1 1 140px' }}>
                  <label htmlFor="csSpeed">Speed</label>
                  <input id="csSpeed" value={form.speed} onChange={(e) => setForm({ ...form, speed: e.target.value })} />
                </div>
              </div>

              <div>
                <label style={{ fontFamily: 'var(--font-display)', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
                  Ability Scores
                </label>
                <div className="ability-edit-grid">
                  {ABILITY_KEYS.map((key) => (
                    <div key={key} className="field">
                      <label htmlFor={`csAbility-${key}`}>{key.toUpperCase()}</label>
                      <input
                        id={`csAbility-${key}`}
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
                <label htmlFor="csEquipment">Equipment</label>
                <textarea
                  id="csEquipment"
                  value={form.equipment}
                  onChange={(e) => setForm({ ...form, equipment: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="field">
                <label htmlFor="csFeatures">Features &amp; Traits</label>
                <textarea
                  id="csFeatures"
                  value={form.features}
                  onChange={(e) => setForm({ ...form, features: e.target.value })}
                  rows={3}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn btn-primary" type="submit">
                  Save Changes
                </button>
                <button className="btn btn-ghost" type="button" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="character-sheet-header">
                <LaurelFlourish>
                  <h1 className="character-sheet-name">{sheet.name}</h1>
                </LaurelFlourish>
                <p className="character-sheet-subtitle">
                  {[sheet.classAndLevel, sheet.race].filter(Boolean).join(' · ') || 'Adventurer'}
                </p>
                {sheet.background && <p className="character-sheet-background">{sheet.background}</p>}
              </div>

              <div className="character-sheet-combat-row">
                <StatHex big label="Armor" value={sheet.armorClass ?? '—'} />
                <StatHex big label="Initiative" value={modifier(abilities.dex)} />
                <StatHex big label="Speed" value={sheet.speed || '—'} />
              </div>

              <div className="hp-block">
                <div className="hp-block-header">
                  <span>Hit Points</span>
                  <span className="hp-block-numbers">
                    {sheet.currentHp ?? '—'} <span className="hp-block-max">/ {sheet.maxHp ?? '—'}</span>
                  </span>
                </div>
                <div className="hp-track">
                  <div className={`hp-track-fill hp-track-fill-${hpBand}`} style={{ width: `${hpPct}%` }} />
                </div>
                {editable && (
                  <div className="hp-adjust-row">
                    <input
                      type="number"
                      min="1"
                      value={hpDelta}
                      onChange={(e) => setHpDelta(e.target.value)}
                      placeholder="1"
                      className="hp-adjust-input"
                      aria-label="Amount"
                    />
                    <button type="button" className="btn btn-danger btn-small" onClick={() => applyHpDelta(-1)}>
                      Damage
                    </button>
                    <button type="button" className="btn btn-ghost btn-small" onClick={() => applyHpDelta(1)}>
                      Heal
                    </button>
                  </div>
                )}
              </div>

              <div className="ability-row">
                {ABILITY_KEYS.map((key) => (
                  <StatHex key={key} label={key.toUpperCase()} value={abilities[key]} sub={modifier(abilities[key])} />
                ))}
              </div>

              <div className="character-sheet-conditions">
                <label className="character-sheet-section-label">Conditions</label>
                <div className="character-sheet-condition-chips">
                  {sheetConditions.length === 0 && <span className="hint-text">None — clean and clear.</span>}
                  {sheetConditions.map((c) => (
                    <span key={c.id} className="condition-chip" title={c.note || undefined}>
                      {c.label}
                      {c.visibleToParty === false && ' · hidden'}
                      {isDM && (
                        <button
                          type="button"
                          onClick={() => handleRemoveCondition(c.id)}
                          aria-label={`Remove ${c.label}`}
                          className="condition-chip-remove"
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                </div>

                {isDM && (
                  <div style={{ marginTop: '0.75rem' }}>
                    {conditionOpen ? (
                      <form
                        onSubmit={handleAddCondition}
                        style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}
                      >
                        <div className="field" style={{ flex: '1 1 140px' }}>
                          <label htmlFor="condLabel">Label</label>
                          <input
                            id="condLabel"
                            value={conditionForm.label}
                            onChange={(e) => setConditionForm({ ...conditionForm, label: e.target.value })}
                            placeholder="Poisoned, Cursed…"
                            autoFocus
                          />
                        </div>
                        <div className="field" style={{ flex: '2 1 200px' }}>
                          <label htmlFor="condNote">Note (optional)</label>
                          <input
                            id="condNote"
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
                            setConditionOpen(false);
                            setConditionForm(BLANK_CONDITION);
                          }}
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <button className="btn btn-ghost btn-small" type="button" onClick={() => setConditionOpen(true)}>
                        + Add Condition
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="character-sheet-columns">
                <div className="character-sheet-scroll">
                  <h3>Equipment</h3>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{sheet.equipment?.trim() || 'Nothing recorded yet.'}</p>
                </div>
                <div className="character-sheet-scroll">
                  <h3>Features &amp; Traits</h3>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{sheet.features?.trim() || 'Nothing recorded yet.'}</p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
                <button className="btn btn-ghost btn-small" type="button" onClick={exportSheet}>
                  Export
                </button>
                {editable && (
                  <button className="btn btn-ghost btn-small" type="button" onClick={startEditing}>
                    Edit Sheet
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
