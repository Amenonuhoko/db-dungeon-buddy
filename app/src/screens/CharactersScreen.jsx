import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { ExampleGallery } from '../components/ExampleGallery.jsx';
import { Panel } from '../components/ornament/Panel.jsx';
import { DownloadIcon } from '../components/ornament/UtilityIcons.jsx';
import {
  BLANK_ABILITIES,
  createSheet,
  EXAMPLES,
  listConditions,
  listSheets,
  LOCAL_PLAYER_ID,
  sheetsToMarkdown,
} from '../lib/characters.js';
import { listCampaignMembers } from '../lib/campaigns.js';
import { useCampaignLive } from '../lib/live.js';
import { downloadTextFile } from '../lib/markdownExport.js';
import { useSession } from '../lib/SessionContext.jsx';

// The Party roster: add a character, and one tappable card per
// character (delete and per-sheet export live on the sheet itself). Actually reading or editing one sheet is a whole
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
  const { campaignId, isDM, isGuest, openInvite } = useOutletContext();
  const { status, user } = useSession();
  const navigate = useNavigate();

  const [sheets, setSheets] = useState([]);
  const [conditions, setConditions] = useState([]);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);

  // Players — guest or account — make their own character (one each; the
  // DM can add more for them) instead of waiting for the DM to hand one
  // out, and never get the DM's "whose character is this" tooling. In
  // account mode that needs migration 007's insert policy.
  const isPlayer = !isDM;
  const ownsACharacter = sheets.some((sheet) => canEditSheet(sheet));
  const canCreate = isDM || (isPlayer && !loading && !ownsACharacter);
  const ownPlayerId = isGuest ? LOCAL_PLAYER_ID : isDM ? '' : user?.id || '';

  // Everything this screen shows, fetched together. Used for the first
  // load and again whenever something changes at the table — a player
  // joins, creates their character, takes damage — so the DM never has
  // to reload to see who's here (useCampaignLive below).
  const load = useCallback(async () => {
    const [s, c] = await Promise.all([listSheets(status, campaignId), listConditions(status, campaignId)]);
    setSheets(s);
    setConditions(c);
    if (status === 'authenticated' && isDM) {
      try {
        const members = await listCampaignMembers(campaignId);
        setPlayers(members.filter((m) => m.role === 'player'));
      } catch (err) {
        setError(`Couldn't load the player list — ${err.message}`);
      }
    }
  }, [status, campaignId, isDM]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [load]);

  useCampaignLive(status === 'authenticated', campaignId, ['campaign_members', 'character_sheets', 'character_conditions'], load);

  function canEditSheet(sheet) {
    if (isDM) return true;
    if (isGuest) return sheet.playerId === LOCAL_PLAYER_ID;
    return status === 'authenticated' && sheet.playerId === user?.id;
  }

  function startCreate() {
    setForm({ ...BLANK_FORM, playerId: ownPlayerId });
    setShowForm(true);
  }

  function useTemplate(example) {
    setForm({
      ...BLANK_FORM,
      ...example,
      abilities: { ...BLANK_ABILITIES, ...example.abilities },
      playerId: ownPlayerId,
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
      // New characters start at full health — one less number to enter.
      currentHp: form.currentHp === '' ? (form.maxHp === '' ? null : Number(form.maxHp)) : Number(form.currentHp),
    };
    try {
      const created = await createSheet(status, campaignId, fields);
      setSheets((prev) => [created, ...prev]);
      setShowForm(false);
      setForm(BLANK_FORM);
      navigate(`/campaigns/${campaignId}/characters/${created.id}`);
    } catch (err) {
      setError(
        isPlayer && /row-level security/i.test(err.message || '')
          ? "Your DM's server doesn't let players create characters yet — they need to run database update 007 (see README). Until then, ask your DM to add yours."
          : err.message,
      );
    }
  }

  // A player's own character comes first — it's the one they came for.
  const orderedSheets = [...sheets].sort((a, b) => Number(!isDM && canEditSheet(b)) - Number(!isDM && canEditSheet(a)));

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
        {/* A player with an empty party gets the button in the empty state
            below instead — one call to action, not two. */}
        {canCreate && !(isPlayer && sheets.length === 0) && (
          <button className="btn btn-primary btn-small" type="button" onClick={startCreate}>
            {isPlayer ? 'Create My Character' : 'Add Character'}
          </button>
        )}
      </div>

      {/* No examples until there's a player to give a character to — in
          account mode every character belongs to a player, so a template
          can't be used yet, and "invite your players" is the next step. */}
      {canCreate && !showForm && (isGuest || isPlayer || players.length > 0) && (
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
              Just the basics — ability scores, equipment and features go on the full sheet, which opens as soon as
              this is saved.
            </p>

            {!isGuest && isDM && (
              <div className="field">
                <label htmlFor="sheetPlayer">Player</label>
                {players.length === 0 ? (
                  <p style={{ fontSize: '0.85rem' }}>
                    No players have joined yet — each character belongs to a player, so invite them first.
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
                <label htmlFor="charName">Character name</label>
                <input
                  id="charName"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Mira Duskwalker"
                  maxLength={120}
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
            </div>

            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <div className="field" style={{ flex: '2 1 160px' }}>
                <label htmlFor="charRace">Race / Species</label>
                <input
                  id="charRace"
                  value={form.race}
                  onChange={(e) => setForm({ ...form, race: e.target.value })}
                  placeholder="Half-Elf"
                />
              </div>
              <div className="field" style={{ flex: '1 1 90px' }}>
                <label htmlFor="charMaxHp">Max HP</label>
                <input id="charMaxHp" type="number" min="0" value={form.maxHp} onChange={(e) => setForm({ ...form, maxHp: e.target.value })} />
              </div>
              <div className="field" style={{ flex: '1 1 90px' }}>
                <label htmlFor="charAC">Armor Class</label>
                <input id="charAC" type="number" value={form.armorClass} onChange={(e) => setForm({ ...form, armorClass: e.target.value })} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn btn-primary" type="submit" disabled={!form.playerId || !form.name.trim()}>
                Create Character
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </Panel>
      )}

      {loading && <p>Loading the party…</p>}
      {!loading && sheets.length === 0 && !showForm && (
        <Panel style={{ textAlign: 'center' }}>
          <p>
            {isPlayer
              ? isGuest
                ? 'Create your character to get started.'
                : 'Create your character to get started — or wait for your DM to make one for you.'
              : isDM
                ? players.length === 0 && openInvite
                  ? 'No players yet. Invite them first — then add a character for each, and they can edit their own.'
                  : isGuest
                  ? 'Add a character for each member of your party.'
                  : 'Add a character for each player — they can edit their own sheet from their device.'
                : ''}
          </p>
          {isPlayer && canCreate && (
            <button className="btn btn-primary btn-small" type="button" onClick={startCreate} style={{ marginTop: '1rem' }}>
              Create My Character
            </button>
          )}
          {isDM && players.length === 0 && openInvite && (
            <button className="btn btn-primary btn-small" type="button" onClick={openInvite} style={{ marginTop: '1rem' }}>
              Invite Players
            </button>
          )}
        </Panel>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {orderedSheets.map((sheet) => (
          <PartyCard
            key={sheet.id}
            sheet={sheet}
            conditions={conditionsByCharacterId[sheet.id] || []}
            mine={!isDM && canEditSheet(sheet)}
            onOpen={() => navigate(`/campaigns/${campaignId}/characters/${sheet.id}`)}
          />
        ))}
      </div>
    </div>
  );
}

// One tap target per character — name, what they are, how hurt they are,
// and what's afflicting them. Everything else (full stats, edit, export,
// delete) lives on the sheet this opens; the roster's job is picking one.
function PartyCard({ sheet, conditions, mine, onOpen }) {
  const hp = sheet.currentHp;
  const max = sheet.maxHp;
  const pct = max ? Math.max(0, Math.min(100, ((hp ?? 0) / max) * 100)) : 0;
  const band = pct > 50 ? 'ok' : pct > 25 ? 'warn' : 'danger';
  return (
    <button type="button" className={`panel party-card${mine ? ' mine' : ''}`} onClick={onOpen}>
      <div className="party-card-top">
        <span className="party-card-name">{sheet.name}</span>
        {mine && <span className="chip chip-small">You</span>}
        <span className="campaign-card-arrow" aria-hidden="true">
          →
        </span>
      </div>
      {(sheet.classAndLevel || sheet.race) && (
        <p className="party-card-sub">{[sheet.classAndLevel, sheet.race].filter(Boolean).join(' · ')}</p>
      )}
      <div className="party-card-stats">
        {max != null && (
          <div className="combat-hp" style={{ marginTop: 0, flex: 1 }}>
            <div className="hp-track hp-track-slim">
              <div className={`hp-track-fill hp-track-fill-${band}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="combat-hp-numbers">
              {hp ?? '—'}/{max}
            </span>
          </div>
        )}
        {sheet.armorClass != null && <span className="chip chip-small">AC {sheet.armorClass}</span>}
      </div>
      {conditions.length > 0 && (
        <div className="combat-conditions">
          {conditions.map((c) => (
            <span key={c.id} className="condition-chip">
              {c.label}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
