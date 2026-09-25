import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BackButton } from '../components/BackButton.jsx';
import { FlowingDivider } from '../components/ornament/FlowingDivider.jsx';
import { Panel } from '../components/ornament/Panel.jsx';
import { QuickCharacterFields } from '../components/QuickCharacterFields.jsx';
import {
  BLANK_ABILITIES,
  BLANK_PICKS,
  createSheet,
  donCharacter,
  explainCreateError,
  finalizeQuickFields,
  isAvailable,
  listSheets,
  wornByUser,
} from '../lib/characters.js';
import { useCampaignLive } from '../lib/live.js';
import { useCampaignPresence } from '../lib/presence.js';
import { bringIntoCampaign, createRosterCharacter, isMissingRoster, listRoster } from '../lib/roster.js';
import { useCampaignAccess } from '../lib/useCampaignAccess.js';
import { useSession } from '../lib/SessionContext.jsx';

// "Choose your character" — the step between joining a campaign and
// sitting down at the table (JoinCampaignScreen sends new players here),
// and where anyone comes back to swap characters. Three ways to don one:
//
//   - slip into a character already in the campaign: a DM pre-made, or
//     one somebody slipped out of (first come, first served);
//   - bring one from My Characters (account holders) — a fresh copy;
//   - create a new one, optionally keeping it in My Characters too.
//
// Or skip it and join the table with no character for now. A player
// wears one character at a time — picking another slips them out of the
// current one, which stays in the campaign for anyone to pick up.
const BLANK_FORM = { name: '', maxHp: '', armorClass: '', currentHp: '' };

export function ChooseCharacterScreen() {
  const { campaignId } = useParams();
  const [params] = useSearchParams();
  const welcome = params.get('welcome') === '1';
  const navigate = useNavigate();
  const { status, user } = useSession();
  const { campaign, isDM, loading: campaignLoading, error: campaignError } = useCampaignAccess(campaignId);
  const isAnonymous = Boolean(user?.is_anonymous);
  const partyPath = `/campaigns/${campaignId}/characters`;

  const [sheets, setSheets] = useState(null);
  const [roster, setRoster] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [picks, setPicks] = useState(BLANK_PICKS);
  const [keepInRoster, setKeepInRoster] = useState(true);

  const presenceMe = useMemo(
    () => (user ? { userId: user.id, name: user.user_metadata?.display_name || 'Adventurer', role: isDM ? 'dm' : 'player' } : null),
    [user, isDM],
  );
  useCampaignPresence(status === 'authenticated' && !campaignLoading, campaignId, presenceMe, 'choosing:');

  const load = useCallback(async () => {
    setSheets(await listSheets('authenticated', campaignId));
  }, [campaignId]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    load().catch((err) => setError(err.message));
    if (!isAnonymous) {
      listRoster()
        .then(setRoster)
        .catch((err) => {
          if (!isMissingRoster(err)) setError(err.message);
        });
    }
  }, [status, load, isAnonymous]);

  // Someone else grabbing a pre-made shows here straight away.
  useCampaignLive(status === 'authenticated', campaignId, ['character_sheets'], load);

  // Offline campaigns have one person on one device — nothing to choose.
  if (status === 'guest') return <Navigate to={partyPath} replace />;

  const current = sheets && user ? wornByUser(sheets, user.id) : null;
  const pool = (sheets || []).filter(isAvailable);

  async function act(action) {
    setBusy(true);
    setError(null);
    try {
      await action();
      navigate(partyPath, { replace: true });
    } catch (err) {
      setError(explainCreateError(err, true));
      load().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  function create(event) {
    event.preventDefault();
    if (!form.name.trim()) return;
    act(async () => {
      const fields = { ...finalizeQuickFields(form, picks), abilities: BLANK_ABILITIES };
      let rosterId = null;
      if (keepInRoster && !isAnonymous) {
        try {
          rosterId = (await createRosterCharacter(fields)).id;
        } catch (err) {
          if (!isMissingRoster(err)) throw err;
        }
      }
      await createSheet('authenticated', campaignId, { ...fields, playerId: user.id, ...(rosterId ? { rosterId } : {}) });
    });
  }

  if (campaignError) {
    return (
      <div className="choose-screen">
        <p className="error-text">{campaignError}</p>
        <BackButton to="/dashboard" label="Campaigns" />
      </div>
    );
  }

  return (
    <div className="choose-screen screen-enter">
      <div className="choose-shell">
        <BackButton to={partyPath} label="Party" />
        <h2 style={{ marginTop: '1rem' }}>{welcome ? 'Welcome to the table' : 'Choose your character'}</h2>
        <p style={{ marginTop: '0.4rem' }}>
          {campaign ? (
            <>
              Who will you play in <strong>{campaign.name}</strong>? You can change later.
            </>
          ) : (
            'Who will you play? You can change later.'
          )}
        </p>
        <div style={{ margin: '1.25rem 0' }}>
          <FlowingDivider />
        </div>

        {error && <p className="error-text" style={{ marginBottom: '1rem' }}>{error}</p>}

        {current && (
          <Panel className="choose-current">
            <p>
              You're playing <strong>{current.name}</strong>. Picking someone else slips you out of them — they stay in
              the campaign for anyone to pick up.
            </p>
            <Link className="btn btn-primary btn-small" to={partyPath}>
              Keep playing {current.name}
            </Link>
          </Panel>
        )}

        {sheets === null && <p className="hint-text">Looking for characters…</p>}

        {pool.length > 0 && (
          <section className="choose-section">
            <h3>Slip into a character</h3>
            <p className="hint-text">Ready to play — made by the DM, or left here by someone who slipped out.</p>
            <ul className="choose-list">
              {pool.map((sheet) => (
                <li key={sheet.id} className="choose-card panel">
                  <CharacterSummary character={sheet} showHp />
                  <button type="button" className="btn btn-primary btn-small" disabled={busy} onClick={() => act(() => donCharacter(sheet.id))}>
                    Slip In
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!isAnonymous && (
          <section className="choose-section">
            <h3>From My Characters</h3>
            {roster.length === 0 ? (
              <p className="hint-text">
                Nothing saved yet. Characters you keep in My Characters can be brought into any campaign.
              </p>
            ) : (
              <ul className="choose-list">
                {roster.map((character) => (
                  <li key={character.id} className="choose-card panel">
                    <CharacterSummary character={character} />
                    <button
                      type="button"
                      className="btn btn-primary btn-small"
                      disabled={busy}
                      onClick={() => act(() => bringIntoCampaign(campaignId, user.id, character))}
                    >
                      Bring In
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="choose-section">
          <h3>Create a new character</h3>
          {!creating ? (
            <button type="button" className="btn btn-ghost" onClick={() => setCreating(true)}>
              + Create a New Character
            </button>
          ) : (
            <Panel>
              <form onSubmit={create} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p className="hint-text" style={{ margin: 0 }}>
                  Just the basics — ability scores, gear and features go on the full sheet afterwards.
                </p>
                <QuickCharacterFields form={form} setForm={setForm} picks={picks} setPicks={setPicks} />
                {!isAnonymous && (
                  <label className="check-row">
                    <input type="checkbox" checked={keepInRoster} onChange={(e) => setKeepInRoster(e.target.checked)} />
                    Also keep in My Characters, to bring into other campaigns
                  </label>
                )}
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <button className="btn btn-primary" type="submit" disabled={busy || !form.name.trim()}>
                    {busy ? 'Creating…' : 'Create & Play'}
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={() => setCreating(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            </Panel>
          )}
        </section>

        {!current && (
          <div style={{ textAlign: 'center', marginTop: '1.75rem' }}>
            <Link className="example-toggle" to={partyPath} replace>
              Join the table without a character for now →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function CharacterSummary({ character, showHp }) {
  const sub = [character.classAndLevel, character.race].filter(Boolean).join(' · ');
  return (
    <div className="choose-card-text">
      <span className="choose-card-name">{character.name}</span>
      {sub && <span className="choose-card-sub">{sub}</span>}
      {showHp && character.maxHp != null && (
        <span className="choose-card-sub">
          HP {character.currentHp ?? character.maxHp}/{character.maxHp}
          {character.armorClass != null ? ` · AC ${character.armorClass}` : ''}
        </span>
      )}
    </div>
  );
}

