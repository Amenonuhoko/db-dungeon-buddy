import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { ExampleGallery } from '../components/ExampleGallery.jsx';
import { PartyStash } from '../components/PartyStash.jsx';
import { TablePresence } from '../components/TablePresence.jsx';
import { TableTalk } from '../components/TableTalk.jsx';
import { Panel } from '../components/ornament/Panel.jsx';
import { DownloadIcon } from '../components/ornament/UtilityIcons.jsx';
import {
  BLANK_ABILITIES,
  CLASSES,
  createSheet,
  EXAMPLES,
  listConditions,
  listSheets,
  LOCAL_PLAYER_ID,
  RACES,
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

// class_and_level/race stay plain text columns in the database (a
// homebrew class or a third-party species is still just a string), so
// the dropdowns below are a UI convenience layered on top, not a schema
// change — this is what turns a stored "Rogue 3" back into a dropdown
// selection (or "Other" + the raw text) when starting from a template.
function parseClassAndLevel(value) {
  const match = /^(.*?)\s+(\d+)\s*$/.exec((value || '').trim());
  const [name, level] = match ? [match[1], match[2]] : [(value || '').trim(), ''];
  if (!name) return { classChoice: '', customClass: '', level: '' };
  return CLASSES.includes(name)
    ? { classChoice: name, customClass: '', level }
    : { classChoice: 'Other', customClass: name, level };
}

function parseRace(value) {
  const trimmed = (value || '').trim();
  if (!trimmed) return { raceChoice: '', customRace: '' };
  return RACES.includes(trimmed) ? { raceChoice: trimmed, customRace: '' } : { raceChoice: 'Other', customRace: trimmed };
}

const BLANK_PICKS = { classChoice: '', customClass: '', level: '', raceChoice: '', customRace: '' };

// Turns a raw Supabase/Postgres error into something the person looking
// at the screen can actually act on — same "don't show a raw error"
// doctrine as lib/session.js's friendlyAuthError(). Branches on the
// Postgres SQLSTATE (err.code) rather than pattern-matching the message
// text, except for the one case (a bare RLS violation with no custom
// message) that needs its own explanation because it's specifically
// "the database hasn't been migrated yet," not "you're not allowed to
// do this" — every other 42501 already carries a specific, readable
// message from a database trigger (see check_sheet_player() in
// db/migrations/007_hardening.sql) and is shown as-is.
function explainCreateError(err, isPlayer) {
  const message = err?.message || '';
  if (err?.code === '42501') {
    if (/row-level security policy/i.test(message)) {
      return isPlayer
        ? "This campaign's database hasn't been updated to let players create their own characters yet — ask your DM to run database update 007 (see the project README), or to add your character for you in the meantime."
        : "The database doesn't yet allow this — it may need database update 007 run (see the project README).";
    }
    return message; // a specific, already-readable message from a trigger
  }
  if (err?.code === '23503') return "That player or campaign couldn't be found — try refreshing the page and creating the character again.";
  if (err?.code === '23514' || err?.code === '23502') return message || "That character is missing something required — check every field and try again.";
  if (/fetch|network|NetworkError/i.test(message) || err?.name === 'TypeError') {
    return "Couldn't reach the server — check your connection and try again.";
  }
  return message || 'Something went wrong creating that character — try again in a moment.';
}

export function CharactersScreen() {
  const { campaignId, isDM, isGuest, openInvite, presence, talk } = useOutletContext();
  const { status, user } = useSession();
  const navigate = useNavigate();

  const [sheets, setSheets] = useState([]);
  const [conditions, setConditions] = useState([]);
  const [members, setMembers] = useState([]);
  const players = members.filter((m) => m.role === 'player');
  const live = status === 'authenticated';
  // Which part of the Party page is showing — in the URL, so a message
  // toast or a tap on someone in "At the table" can open a conversation.
  const [params, setParams] = useSearchParams();
  const view = ['stash', 'talk'].includes(params.get('view')) && (live || params.get('view') === 'stash') ? params.get('view') : 'characters';
  const thread = params.get('thread');
  const showView = (next, nextThread = null) => {
    const p = {};
    if (next !== 'characters') p.view = next;
    if (nextThread) p.thread = nextThread;
    setParams(p, { replace: true });
  };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [picks, setPicks] = useState(BLANK_PICKS);

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
    if (status === 'authenticated') {
      try {
        setMembers(await listCampaignMembers(campaignId));
      } catch (err) {
        setError(`Couldn't load the player list — ${err.message}`);
      }
    }
  }, [status, campaignId]);

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
    setPicks(BLANK_PICKS);
    setShowForm(true);
  }

  function useTemplate(example) {
    setForm({
      ...BLANK_FORM,
      ...example,
      abilities: { ...BLANK_ABILITIES, ...example.abilities },
      playerId: ownPlayerId,
    });
    setPicks({ ...parseClassAndLevel(example.classAndLevel), ...parseRace(example.race) });
    setShowForm(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.name.trim() || !form.playerId) return;
    const finalClass = picks.classChoice === 'Other' ? picks.customClass.trim() : picks.classChoice;
    const finalRace = picks.raceChoice === 'Other' ? picks.customRace.trim() : picks.raceChoice;
    const fields = {
      ...form,
      name: form.name.trim(),
      classAndLevel: [finalClass, picks.level.trim()].filter(Boolean).join(' '),
      race: finalRace,
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
      setPicks(BLANK_PICKS);
      navigate(`/campaigns/${campaignId}/characters/${created.id}`);
    } catch (err) {
      setError(explainCreateError(err, isPlayer));
    }
  }

  // A player's own character comes first — it's the one they came for.
  const orderedSheets = [...sheets].sort((a, b) => Number(!isDM && canEditSheet(b)) - Number(!isDM && canEditSheet(a)));

  const conditionsByCharacterId = conditions.reduce((map, c) => {
    (map[c.characterId] ||= []).push(c);
    return map;
  }, {});

  const onlinePlayers = presence?.online || {};
  const unreadTalk = talk?.totalUnread || 0;

  return (
    <div>
      {live && presence && (
        <TablePresence
          members={members}
          online={onlinePlayers}
          ready={presence.ready}
          myId={user?.id}
          onWhisper={talk?.status === 'unavailable' ? null : (userId) => showView('talk', userId)}
        />
      )}

      <div className="party-views" role="tablist" aria-label="Party">
        <button type="button" role="tab" aria-selected={view === 'characters'} className={view === 'characters' ? 'active' : ''} onClick={() => showView('characters')}>
          Characters
        </button>
        <button type="button" role="tab" aria-selected={view === 'stash'} className={view === 'stash' ? 'active' : ''} onClick={() => showView('stash')}>
          Stash
        </button>
        {live && (
          <button type="button" role="tab" aria-selected={view === 'talk'} className={view === 'talk' ? 'active' : ''} onClick={() => showView('talk')}>
            Talk
            {unreadTalk > 0 && <span className="party-views-badge">{unreadTalk > 9 ? '9+' : unreadTalk}</span>}
          </button>
        )}
      </div>

      {view === 'stash' && (
        <PartyStash status={status} campaignId={campaignId} characterNames={sheets.map((sheet) => sheet.name)} />
      )}

      {view === 'talk' && talk && (
        <TableTalk talk={talk} members={members} online={onlinePlayers} thread={thread} onThread={(t) => showView('talk', t)} />
      )}

      {view === 'characters' && (
        <>
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
                  <div className="field" style={{ flex: '2 1 160px' }}>
                    <label htmlFor="charClass">Class</label>
                    <select
                      id="charClass"
                      value={picks.classChoice}
                      onChange={(e) => setPicks({ ...picks, classChoice: e.target.value })}
                    >
                      <option value="">Choose a class…</option>
                      {CLASSES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                      <option value="Other">Other…</option>
                    </select>
                  </div>
                  <div className="field" style={{ flex: '1 1 90px' }}>
                    <label htmlFor="charLevel">Level</label>
                    <input
                      id="charLevel"
                      type="number"
                      min="1"
                      max="20"
                      value={picks.level}
                      onChange={(e) => setPicks({ ...picks, level: e.target.value })}
                      placeholder="1"
                    />
                  </div>
                </div>

                {picks.classChoice === 'Other' && (
                  <div className="field">
                    <label htmlFor="charClassCustom">Custom class</label>
                    <input
                      id="charClassCustom"
                      value={picks.customClass}
                      onChange={(e) => setPicks({ ...picks, customClass: e.target.value })}
                      placeholder="Artificer"
                      autoFocus
                    />
                  </div>
                )}

                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <div className="field" style={{ flex: '2 1 160px' }}>
                    <label htmlFor="charRace">Race / Species</label>
                    <select
                      id="charRace"
                      value={picks.raceChoice}
                      onChange={(e) => setPicks({ ...picks, raceChoice: e.target.value })}
                    >
                      <option value="">Choose a race…</option>
                      {RACES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                      <option value="Other">Other…</option>
                    </select>
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

                {picks.raceChoice === 'Other' && (
                  <div className="field">
                    <label htmlFor="charRaceCustom">Custom race / species</label>
                    <input
                      id="charRaceCustom"
                      value={picks.customRace}
                      onChange={(e) => setPicks({ ...picks, customRace: e.target.value })}
                      placeholder="Tabaxi"
                    />
                  </div>
                )}

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
                here={live && Boolean(onlinePlayers[sheet.playerId])}
                onOpen={() => navigate(`/campaigns/${campaignId}/characters/${sheet.id}`)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// One tap target per character — name, what they are, how hurt they are,
// and what's afflicting them. Everything else (full stats, edit, export,
// delete) lives on the sheet this opens; the roster's job is picking one.
function PartyCard({ sheet, conditions, mine, here, onOpen }) {
  const hp = sheet.currentHp;
  const max = sheet.maxHp;
  const pct = max ? Math.max(0, Math.min(100, ((hp ?? 0) / max) * 100)) : 0;
  const band = pct > 50 ? 'ok' : pct > 25 ? 'warn' : 'danger';
  return (
    <button type="button" className={`panel party-card${mine ? ' mine' : ''}`} onClick={onOpen}>
      <div className="party-card-top">
        <span className="party-card-name">
          {here && <span className="presence-dot online inline" title="Their player is here now" aria-label="Player is here now" />}
          {sheet.name}
        </span>
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
