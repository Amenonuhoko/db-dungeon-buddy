import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { DeleteButton } from '../components/DeleteButton.jsx';
import { ExampleGallery } from '../components/ExampleGallery.jsx';
import { Panel } from '../components/ornament/Panel.jsx';
import { DownloadIcon } from '../components/ornament/UtilityIcons.jsx';
import {
  ABILITY_KEYS,
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
} from '../lib/characters.js';
import { listCampaignMembers } from '../lib/campaigns.js';
import { downloadTextFile, slugify } from '../lib/markdownExport.js';
import { useSession } from '../lib/SessionContext.jsx';

// The roster: create/hand out a sheet, a quick-glance card per character,
// Export, and Delete. Actually reading or editing one sheet is a whole
// screen of its own — see CharacterSheetScreen.jsx / BIBLE.md §3/§9 —
// this list's job is picking which one, not showing it in full.
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

export function CharactersScreen() {
  const { campaignId, isDM, isGuest } = useOutletContext();
  const { status, user } = useSession();
  const navigate = useNavigate();

  const [sheets, setSheets] = useState([]);
  const [conditions, setConditions] = useState([]);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);

  // A guest who chose "Player" at the door already gets that choice
  // respected everywhere else (Encyclopedia/Bestiary lock to read-only
  // for them) — this screen used to ignore it and grant blanket DM
  // powers to any guest. Now a guest-player gets exactly what a real
  // player gets: their own single sheet, not "hand out a sheet to
  // someone else" DM tooling.
  const isGuestPlayer = isGuest && !isDM;
  const canCreate = isDM || (isGuestPlayer && sheets.length === 0);

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

  function canEditSheet(sheet) {
    if (isDM) return true;
    if (isGuest) return sheet.playerId === LOCAL_PLAYER_ID;
    return status === 'authenticated' && sheet.playerId === user?.id;
  }

  function startCreate() {
    setForm({ ...BLANK_FORM, playerId: isGuest ? LOCAL_PLAYER_ID : '' });
    setShowForm(true);
  }

  function useTemplate(example) {
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
      const created = await createSheet(status, campaignId, fields);
      setSheets((prev) => [created, ...prev]);
      setShowForm(false);
      setForm(BLANK_FORM);
      navigate(`/campaigns/${campaignId}/characters/${created.id}`);
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

  const conditionsByCharacterId = conditions.reduce((map, c) => {
    (map[c.characterId] ||= []).push(c);
    return map;
  }, {});

  return (
    <div>
      {error && <p className="error-text" style={{ marginBottom: '1rem' }}>{error}</p>}

      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
        <button
          className="btn btn-ghost btn-small btn-icon"
          type="button"
          onClick={() => downloadTextFile('characters.md', sheetsToMarkdown(sheets, conditionsByCharacterId, 'Campaign'))}
          disabled={sheets.length === 0}
          title="Export Markdown"
          aria-label="Export Markdown"
        >
          <DownloadIcon />
        </button>
        {canCreate && (
          <button className="btn btn-primary btn-small" type="button" onClick={startCreate}>
            {isGuestPlayer ? 'Create My Sheet' : 'Hand Out a Sheet'}
          </button>
        )}
      </div>

      {canCreate && !showForm && (
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
              Who are they, how do they fight, and what's one thing that makes them a person, not a stat block? The
              full sheet — everything else, HP tracking, conditions — opens once this is saved.
            </p>

            {!isGuest && (
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
              <div className="ability-edit-grid">
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
                {isGuestPlayer ? 'Create Sheet' : 'Hand Out Sheet'}
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
        <p>
          {canCreate
            ? isGuestPlayer
              ? 'No sheet yet — create yours below.'
              : 'No sheets yet — hand out the first one.'
            : "You don't have a character sheet yet — ask your DM."}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {sheets.map((sheet) => {
          const abilities = { ...BLANK_ABILITIES, ...sheet.abilities };
          const sheetConditions = conditionsByCharacterId[sheet.id] || [];
          return (
            <Panel key={sheet.id}>
              {canEditSheet(sheet) && <DeleteButton onConfirm={() => handleDeleteSheet(sheet.id)} label={sheet.name} />}
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
                  gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
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

              {sheetConditions.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.75rem' }}>
                  {sheetConditions.map((c) => (
                    <span key={c.id} className="condition-chip">
                      {c.label}
                    </span>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button
                  className="btn btn-ghost btn-small"
                  type="button"
                  onClick={() => downloadTextFile(`${slugify(sheet.name)}.md`, sheetToMarkdown(sheet, sheetConditions))}
                >
                  Export
                </button>
                <button
                  className="btn btn-primary btn-small"
                  type="button"
                  onClick={() => navigate(`/campaigns/${campaignId}/characters/${sheet.id}`)}
                >
                  Open Sheet
                </button>
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
