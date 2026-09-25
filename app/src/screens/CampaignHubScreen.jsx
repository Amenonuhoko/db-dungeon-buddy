import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConfirmButton } from '../components/ConfirmButton.jsx';
import { DashboardCard } from '../components/DashboardCard.jsx';
import { MyCharacters } from '../components/MyCharacters.jsx';
import { FlowingDivider } from '../components/ornament/FlowingDivider.jsx';
import { Panel } from '../components/ornament/Panel.jsx';
import { UploadIcon } from '../components/ornament/UtilityIcons.jsx';
import { importCampaignTemplate, validateCampaignTemplate } from '../lib/campaignImport.js';
import {
  createCampaign,
  createGuestCampaign,
  listGuestCampaigns,
  listMyCampaigns,
} from '../lib/campaigns.js';
import { loadDashboard } from '../lib/dashboard.js';
import { useSession } from '../lib/SessionContext.jsx';

// The hub splits into what you're playing and what you're running
// (remembered per device); anonymous players only ever play.
const HUB_VIEW_KEY = 'dungeonbuddy.hubView';
function readHubView() {
  try {
    return localStorage.getItem(HUB_VIEW_KEY);
  } catch {
    return null;
  }
}

const ROLE_LABEL = { dm: 'Dungeon Master', player: 'Player' };

function CampaignRow({ campaign, onOpen }) {
  return (
    <button type="button" className="campaign-card" onClick={() => onOpen(campaign.id)}>
      <span className="campaign-card-name">{campaign.name}</span>
      <span className="campaign-card-meta">
        <span className="chip chip-small">{ROLE_LABEL[campaign.role]}</span>
        <span aria-hidden="true" className="campaign-card-arrow">
          →
        </span>
      </span>
    </button>
  );
}

export function CampaignHubScreen() {
  const { status, guest, user, logOut, changeDisplayName } = useSession();
  const navigate = useNavigate();

  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(status === 'authenticated');
  const [error, setError] = useState(null);

  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [busy, setBusy] = useState(false);
  // The create form is tucked behind a button once there's a campaign to
  // pick — you're here to open one. With none yet, it's shown straight
  // away (see `showCreate` below).
  const [createOpen, setCreateOpen] = useState(false);
  const fileInputRef = useRef(null);
  const [dash, setDash] = useState({});
  const [savedView, setSavedView] = useState(readHubView);
  const [nameDraft, setNameDraft] = useState(null); // null = not editing
  const [nameError, setNameError] = useState(null);

  useEffect(() => {
    if (status === 'guest') {
      // Scoped to the role picked at the door, not just labeled with a
      // chip — a guest who chose Player should never see, let alone be
      // able to open, a campaign this device made in DM mode (and vice
      // versa). Same underlying localStorage list either way; entering
      // as the other role again brings the rest of it back. See
      // BIBLE.md §4.
      setCampaigns(listGuestCampaigns().filter((c) => c.role === guest.role));
      return;
    }
    if (status === 'authenticated') {
      setLoading(true);
      listMyCampaigns()
        .then(setCampaigns)
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }
  }, [status, guest?.role]);

  // At-a-glance status for every campaign (lib/dashboard.js), refreshed
  // when you come back to the tab — a fight may have started meanwhile.
  const userId = user?.id;
  useEffect(() => {
    if (status !== 'authenticated' || campaigns.length === 0) return undefined;
    let cancelled = false;
    const refresh = () =>
      loadDashboard(campaigns, userId)
        .then((next) => !cancelled && setDash(next))
        .catch(() => {});
    refresh();
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [status, campaigns, userId]);

  function openCampaign(id) {
    navigate(`/campaigns/${id}`);
  }

  async function handleCreate(event) {
    event.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (status === 'guest') {
        const campaign = createGuestCampaign(newName.trim(), guest.role);
        setCampaigns((prev) => [campaign, ...prev]);
        setNewName('');
        openCampaign(campaign.id);
      } else {
        const campaign = await createCampaign(newName.trim(), newDescription.trim());
        setCampaigns((prev) => [campaign, ...prev]);
        setNewName('');
        setNewDescription('');
        openCampaign(campaign.id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Reads a campaign-template JSON file picked from device storage (see
  // campaign-template.example.json at the repo root for the shape a
  // filled-out one should have) and creates the campaign + every entry
  // it contains — see lib/campaignImport.js for why this is exactly the
  // same create path the manual forms use, not a separate bulk-insert.
  async function handleImportFile(event) {
    const file = event.target.files?.[0];
    event.target.value = ''; // lets picking the same file twice re-fire onChange
    if (!file) return;

    setBusy(true);
    setError(null);
    try {
      const text = await file.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("That file isn't valid JSON.");
      }
      const problem = validateCampaignTemplate(data);
      if (problem) throw new Error(problem);

      const campaign = await importCampaignTemplate(status, guest?.role, data);
      setCampaigns((prev) => [campaign, ...prev]);
      openCampaign(campaign.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveName(event) {
    event.preventDefault();
    setNameError(null);
    try {
      await changeDisplayName(nameDraft);
      setNameDraft(null);
    } catch (err) {
      setNameError(err.message);
    }
  }

  async function handleLogOut() {
    await logOut();
    navigate('/');
  }

  const isAnonymous = Boolean(user?.is_anonymous);
  // Anonymous "joined as a player" accounts can't own a campaign's DM
  // role in any useful way (no way back in on another device) — they
  // join, they don't create. Everyone else can create.
  const canCreate = !isAnonymous;

  // Playing / Running (account holders). Default: whatever you picked
  // last; otherwise Playing if you're in anyone's game, else Running
  // (a brand-new account lands where it can start a campaign).
  const split = status === 'authenticated' && !isAnonymous;
  const playing = campaigns.filter((c) => c.role !== 'dm');
  const running = campaigns.filter((c) => c.role === 'dm');
  const view = !split ? 'playing' : savedView === 'playing' || savedView === 'running' ? savedView : playing.length ? 'playing' : 'running';
  function chooseView(next) {
    setSavedView(next);
    setCreateOpen(false);
    try {
      localStorage.setItem(HUB_VIEW_KEY, next);
    } catch {
      // Storage blocked — the choice just won't be remembered.
    }
  }
  const shown = split ? (view === 'running' ? running : playing) : campaigns;
  const creating = status === 'guest' || (split && view === 'running');
  const showCreate = canCreate && creating && (createOpen || (!loading && shown.length === 0));
  const name = status === 'guest' ? guest.displayName : user?.user_metadata?.display_name || user?.email;

  return (
    // Bottom padding matches CampaignScreen's — same reasoning: has to
    // clear the global dice-fab (bottom:5.5rem + 52px ≈ 140px from the
    // viewport bottom), not just look roomy.
    <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: '3rem 1.5rem 10rem' }}>
      <div className="screen-enter" style={{ width: 'min(640px, 100%)' }}>
        {nameDraft === null ? (
          <h2 style={{ textAlign: 'center' }}>
            Welcome, {name}
            {status !== 'signed-out' && (
              <button
                type="button"
                className="example-toggle name-edit"
                onClick={() => setNameDraft(status === 'guest' ? guest.displayName : user?.user_metadata?.display_name || '')}
              >
                Change name
              </button>
            )}
          </h2>
        ) : (
          <form onSubmit={saveName} className="name-edit-form">
            <div className="field">
              <label htmlFor="displayNameEdit">Your name at the table</label>
              <input id="displayNameEdit" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} maxLength={60} autoFocus />
            </div>
            {nameError && <p className="error-text">{nameError}</p>}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
              <button className="btn btn-primary btn-small" type="submit" disabled={!nameDraft.trim()}>
                Save
              </button>
              <button className="btn btn-ghost btn-small" type="button" onClick={() => setNameDraft(null)}>
                Cancel
              </button>
            </div>
          </form>
        )}
        <p style={{ textAlign: 'center', marginTop: '0.4rem' }}>
          {status === 'guest' && `${ROLE_LABEL[guest.role]} · offline on this device`}
          {status === 'authenticated' && isAnonymous && 'Joined as a player · no account'}
          {status === 'authenticated' && !isAnonymous && 'Your campaigns'}
        </p>

        <div style={{ margin: '1.5rem 0' }}>
          <FlowingDivider />
        </div>

        {error && (
          <p className="error-text" style={{ textAlign: 'center', marginBottom: '1rem' }}>
            {error}
          </p>
        )}

        {split && (
          <div className="party-views hub-views" role="tablist" aria-label="Your campaigns">
            <button type="button" role="tab" aria-selected={view === 'playing'} className={view === 'playing' ? 'active' : ''} onClick={() => chooseView('playing')}>
              Playing{playing.length ? ` · ${playing.length}` : ''}
            </button>
            <button type="button" role="tab" aria-selected={view === 'running'} className={view === 'running' ? 'active' : ''} onClick={() => chooseView('running')}>
              Running{running.length ? ` · ${running.length}` : ''}
            </button>
          </div>
        )}

        <Panel corners topRule style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {loading && <p>Loading your campaigns…</p>}

          {!loading && shown.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              {shown.map((c) =>
                status === 'authenticated' ? (
                  <DashboardCard key={c.id} campaign={c} info={dash[c.id]} onOpen={(path) => navigate(path)} />
                ) : (
                  <CampaignRow key={c.id} campaign={c} onOpen={openCampaign} />
                ),
              )}
            </div>
          )}

          {!loading && shown.length === 0 && (
            <p style={{ textAlign: 'center' }}>
              {status === 'guest'
                ? 'No campaigns on this device yet — start one below.'
                : isAnonymous
                  ? 'Ask your DM for an invite link to join a game.'
                  : view === 'playing'
                    ? "You're not playing in anyone's campaign yet — ask your DM for an invite link, or join with a code."
                    : "You're not running a campaign yet — start one below."}
            </p>
          )}

          {showCreate ? (
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h3 style={{ fontSize: '1rem' }}>New Campaign</h3>
              <div className="field">
                <label htmlFor="campaignName">Name</label>
                <input
                  id="campaignName"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="The Sunken Citadel"
                  maxLength={120}
                  autoFocus={createOpen}
                />
              </div>
              {status === 'authenticated' && (
                <div className="field">
                  <label htmlFor="campaignDescription">Description (optional)</label>
                  <textarea
                    id="campaignDescription"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    rows={2}
                  />
                </div>
              )}
              <p className="hint-text" style={{ marginBottom: 0 }}>
                You'll be the Dungeon Master{status === 'authenticated' ? ' — invite your players from inside the campaign' : ''}.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn btn-primary" type="submit" disabled={busy || !newName.trim()}>
                  {busy ? 'Creating…' : 'Create Campaign'}
                </button>
                {shown.length > 0 && (
                  <button className="btn btn-ghost" type="button" onClick={() => setCreateOpen(false)}>
                    Cancel
                  </button>
                )}
              </div>
            </form>
          ) : (
            <div className="hub-actions">
              {canCreate && creating && (
                <button className="btn btn-ghost" type="button" onClick={() => setCreateOpen(true)}>
                  + New Campaign
                </button>
              )}
              {status === 'authenticated' && view === 'playing' && (
                <button className="btn btn-ghost" type="button" onClick={() => navigate('/join')}>
                  Join with a Code
                </button>
              )}
            </div>
          )}

          {/* One-shot import (lib/campaignImport.js) — a quiet link rather
              than a third big button, since most people never need it. */}
          {canCreate && creating && (
            <div style={{ textAlign: 'center' }}>
              <button
                className="example-toggle"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
              >
                <UploadIcon />
                Import a campaign file
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleImportFile}
                style={{ display: 'none' }}
              />
            </div>
          )}
        </Panel>

        {split && view === 'playing' && <MyCharacters />}

        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          {isAnonymous ? (
            // An anonymous player has no email or password to come back
            // with — signing out is permanent. Say so before it happens.
            <>
              <ConfirmButton onConfirm={handleLogOut} className="example-toggle" confirmLabel="Tap again — you won't be able to get back in">
                Leave Table
              </ConfirmButton>
              <p className="hint-text" style={{ marginTop: '0.4rem' }}>
                You joined without an account, so leaving signs you out for good on this device.
              </p>
            </>
          ) : (
            <button className="example-toggle" onClick={handleLogOut} type="button">
              {status === 'guest' ? 'Leave Offline Mode' : 'Log Out'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
