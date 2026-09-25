import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FlowingDivider } from '../components/ornament/FlowingDivider.jsx';
import { Panel } from '../components/ornament/Panel.jsx';
import {
  createCampaign,
  createGuestCampaign,
  joinCampaignByCode,
  listGuestCampaigns,
  listMyCampaigns,
} from '../lib/campaigns.js';
import { useSession } from '../lib/SessionContext.jsx';

const ROLE_LABEL = { dm: 'Dungeon Master', player: 'Player' };

function CampaignRow({ campaign, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(campaign.id)}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        textAlign: 'left',
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius)',
        padding: '1rem 1.25rem',
        color: 'var(--text)',
        cursor: 'pointer',
      }}
    >
      <span style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.03em' }}>{campaign.name}</span>
      <span className="chip">{ROLE_LABEL[campaign.role]}</span>
    </button>
  );
}

export function CampaignHubScreen() {
  const { status, guest, user, logOut } = useSession();
  const navigate = useNavigate();

  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(status === 'authenticated');
  const [error, setError] = useState(null);

  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);

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

  async function handleJoin(event) {
    event.preventDefault();
    if (!joinCode.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const campaign = await joinCampaignByCode(joinCode.trim());
      setCampaigns((prev) => [campaign, ...prev]);
      setJoinCode('');
      openCampaign(campaign.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogOut() {
    await logOut();
    navigate('/');
  }

  const isAnonymous = Boolean(user?.is_anonymous);
  const name = status === 'guest' ? guest.displayName : user?.user_metadata?.display_name || user?.email;

  return (
    // Bottom padding matches CampaignScreen's — same reasoning: has to
    // clear the global dice-fab (bottom:5.5rem + 52px ≈ 140px from the
    // viewport bottom), not just look roomy.
    <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: '3rem 1.5rem 10rem' }}>
      <div className="screen-enter" style={{ width: 'min(640px, 100%)' }}>
        <h2 style={{ textAlign: 'center' }}>Welcome, {name}</h2>
        <p style={{ textAlign: 'center', marginTop: '0.4rem' }}>
          {status === 'guest' && `${ROLE_LABEL[guest.role]} · local device`}
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

        <Panel corners topRule style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Your Campaigns</h3>
            {loading && <p>Loading…</p>}
            {!loading && campaigns.length === 0 && (
              <p>{status === 'guest' ? 'No local campaigns yet — start one below.' : 'Nothing yet — create or join one below.'}</p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {campaigns.map((c) => (
                <CampaignRow key={c.id} campaign={c} onOpen={openCampaign} />
              ))}
            </div>
          </div>

          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h3 style={{ fontSize: '1rem' }}>
                {status === 'guest' ? 'Start a Local Campaign' : 'Create a Campaign'}
              </h3>
              <button className="btn btn-ghost btn-small" type="button" onClick={() => navigate('/generate')}>
                ✦ Generate with AI
              </button>
            </div>
            <div className="field">
              <label htmlFor="campaignName">Name</label>
              <input
                id="campaignName"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="The Sunken Citadel"
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
            <button className="btn btn-primary" type="submit" disabled={busy || !newName.trim()}>
              {status === 'guest' ? 'Create Local Campaign' : 'Create Campaign'}
            </button>
          </form>

          {status === 'authenticated' && (
            <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h3 style={{ fontSize: '1rem' }}>Join a Campaign</h3>
              <div className="field">
                <label htmlFor="joinCode">Invite Code</label>
                <input
                  id="joinCode"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="from your DM"
                />
              </div>
              <button className="btn btn-ghost" type="submit" disabled={busy || !joinCode.trim()}>
                Join as Player
              </button>
            </form>
          )}

          <button className="btn btn-ghost" onClick={handleLogOut} type="button">
            {status === 'guest' || isAnonymous ? 'Leave Table' : 'Log Out'}
          </button>
        </Panel>
      </div>
    </div>
  );
}
