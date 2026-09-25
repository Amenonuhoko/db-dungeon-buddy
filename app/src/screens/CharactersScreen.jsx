import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { ExampleGallery } from '../components/ExampleGallery.jsx';
import { PartyStash } from '../components/PartyStash.jsx';
import { QuickCharacterFields } from '../components/QuickCharacterFields.jsx';
import { TablePresence } from '../components/TablePresence.jsx';
import { TableTalk } from '../components/TableTalk.jsx';
import { Panel } from '../components/ornament/Panel.jsx';
import { DownloadIcon } from '../components/ornament/UtilityIcons.jsx';
import {
  BLANK_ABILITIES,
  BLANK_PICKS,
  createSheet,
  EXAMPLES,
  customOptions,
  explainCreateError,
  finalizeQuickFields,
  listConditions,
  listSheets,
  LOCAL_PLAYER_ID,
  parseClassAndLevel,
  parseRace,
  sheetsToMarkdown,
  wornByUser,
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

// The DM's "who plays this?" choice for a pre-made nobody wears yet.
const POOL = 'pool';

export function CharactersScreen() {
  const { campaignId, isDM, isGuest, openInvite, presence, talk, worn, previewAsPlayer } = useOutletContext();
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
  // Online, a player picks, creates or swaps their character on the
  // "Choose your character" screen (slip into one from the pool, bring
  // one from My Characters, or make a new one) — BIBLE.md §7, 009.
  // Offline there's one person on one device, so they create here.
  const accountPlayer = live && isPlayer;
  const myCharacter = accountPlayer ? wornByUser(sheets, user?.id) : null;
  const choosePath = `/campaigns/${campaignId}/choose`;
  const canCreate = isDM || (isGuest && isPlayer && !loading && !ownsACharacter);
  const custom = customOptions(sheets);
  const memberName = (userId) => members.find((m) => m.userId === userId)?.displayName || 'a player';
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

  useCampaignLive(status === 'authenticated', campaignId, ['campaign_members', 'character_sheets', 'character_details', 'character_conditions'], load);

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
    setPicks({ ...parseClassAndLevel(example.classAndLevel, custom.classes), ...parseRace(example.race, custom.races) });
    setShowForm(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.name.trim() || !form.playerId) return;
    const fields = {
      ...form,
      ...finalizeQuickFields(form, picks),
      // A DM pre-made worn by nobody yet — anyone can slip into it.
      playerId: form.playerId === POOL ? null : form.playerId,
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

  // Previewing as a player (lib/viewAs.js): hidden conditions only show
  // on the character you're wearing, as RLS would do for a real player.
  const wornIds = new Set(sheets.filter((sheet) => sheet.playerId && sheet.playerId === user?.id).map((sheet) => sheet.id));
  const shownConditions = previewAsPlayer
    ? conditions.filter((c) => c.visibleToParty !== false || wornIds.has(c.characterId))
    : conditions;
  const conditionsByCharacterId = shownConditions.reduce((map, c) => {
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
          worn={worn}
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
        <TableTalk talk={talk} members={members} online={onlinePlayers} worn={worn} thread={thread} onThread={(t) => showView('talk', t)} />
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

          {accountPlayer && !loading && (
            <Panel className="playing-banner">
              {myCharacter ? (
                <>
                  <p>
                    You're playing <strong>{myCharacter.name}</strong>.
                  </p>
                  <div className="playing-banner-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-small"
                      onClick={() => navigate(`/campaigns/${campaignId}/characters/${myCharacter.id}`)}
                    >
                      Open Sheet
                    </button>
                    <button type="button" className="btn btn-ghost btn-small" onClick={() => navigate(choosePath)}>
                      Change Character
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p>You're at the table without a character.</p>
                  <div className="playing-banner-actions">
                    <button type="button" className="btn btn-primary btn-small" onClick={() => navigate(choosePath)}>
                      Choose a Character
                    </button>
                  </div>
                </>
              )}
            </Panel>
          )}

          {/* No examples until there's a player to give a character to — in
              account mode every character belongs to a player, so a template
              can't be used yet, and "invite your players" is the next step. */}
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
                  Just the basics — ability scores, equipment and features go on the full sheet, which opens as soon as
                  this is saved.
                </p>

                {!isGuest && isDM && (
                  <div className="field">
                    <label htmlFor="sheetPlayer">Played by</label>
                    <select
                      id="sheetPlayer"
                      value={form.playerId}
                      onChange={(e) => setForm({ ...form, playerId: e.target.value })}
                    >
                      <option value="" disabled>
                        Choose…
                      </option>
                      <option value={POOL}>Nobody yet — a pre-made anyone can slip into</option>
                      {players.map((p) => (
                        <option key={p.userId} value={p.userId}>
                          {p.displayName}
                          {worn?.[p.userId] ? ` (now playing ${worn[p.userId]})` : ''}
                        </option>
                      ))}
                    </select>
                    <span className="hint-text" style={{ margin: 0 }}>
                      Players wear one character at a time — giving someone this one slips them out of their current one.
                    </span>
                  </div>
                )}

                <QuickCharacterFields
                  form={form}
                  setForm={setForm}
                  picks={picks}
                  setPicks={setPicks}
                  extraClasses={custom.classes}
                  extraRaces={custom.races}
                />

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
                    : 'No characters in this campaign yet — choose or create yours above.'
                  : isDM
                    ? players.length === 0 && openInvite
                      ? 'No players yet. Invite them — or add a few pre-made characters now for them to slip into.'
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
                playedBy={live ? (sheet.playerId ? memberName(sheet.playerId) : null) : undefined}
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
// playedBy: the player's name, null for a character nobody wears (the
// open pool), undefined offline (one person plays everything).
function PartyCard({ sheet, conditions, mine, here, playedBy, onOpen }) {
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
        {!mine && playedBy && <span className="chip chip-small">{playedBy}</span>}
        {playedBy === null && <span className="chip chip-small chip-available">Available</span>}
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
