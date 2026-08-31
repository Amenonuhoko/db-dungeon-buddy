import { useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, useNavigate, useParams } from 'react-router-dom';
import { getGuestCampaign, getMyCampaign } from '../lib/campaigns.js';
import { useSession } from '../lib/SessionContext.jsx';

const TABS = [
  { to: 'encyclopedia', label: 'Encyclopedia' },
  { to: 'notes', label: 'Notes' },
  { to: 'bestiary', label: 'Bestiary' },
];

export function CampaignScreen() {
  const { campaignId } = useParams();
  const { status } = useSession();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setCampaign(null);
    setError(null);
    if (status === 'guest') {
      const found = getGuestCampaign(campaignId);
      if (found) setCampaign(found);
      else setError('That local campaign no longer exists on this device.');
      return;
    }
    if (status === 'authenticated') {
      getMyCampaign(campaignId)
        .then(setCampaign)
        .catch(() => setError("You don't have access to that campaign."));
    }
  }, [status, campaignId]);

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '1.5rem' }}>
        <div className="screen-enter" style={{ textAlign: 'center' }}>
          <p className="error-text">{error}</p>
          <button className="btn btn-ghost" style={{ marginTop: '1rem' }} onClick={() => navigate('/dashboard')}>
            Back to Campaigns
          </button>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <p style={{ fontFamily: 'var(--font-display)', color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
          OPENING THE CODEX…
        </p>
      </div>
    );
  }

  const isDM = campaign.role === 'dm';

  return (
    <div className="screen-enter" style={{ minHeight: '100vh', padding: '2.5rem 1.5rem 3rem' }}>
      <div style={{ width: 'min(920px, 100%)', margin: '0 auto' }}>
        <button className="btn btn-ghost btn-small" onClick={() => navigate('/dashboard')} type="button">
          ← Campaigns
        </button>

        <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2>{campaign.name}</h2>
          <span className="chip">{isDM ? 'Dungeon Master' : 'Player'}</span>
        </div>

        {isDM && campaign.invite_code && (
          <p style={{ marginTop: '0.4rem', fontSize: '0.85rem' }}>
            Invite code: <span style={{ color: 'var(--gold-bright)', letterSpacing: '0.08em' }}>{campaign.invite_code}</span>
          </p>
        )}

        <nav style={{ display: 'flex', gap: '0.5rem', margin: '1.75rem 0', borderBottom: '1px solid var(--line)' }}>
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              style={({ isActive }) => ({
                padding: '0.75rem 1rem',
                fontFamily: 'var(--font-display)',
                fontSize: '0.8rem',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: isActive ? 'var(--gold-bright)' : 'var(--text-dim)',
                borderBottom: isActive ? '2px solid var(--gold-bright)' : '2px solid transparent',
                marginBottom: '-1px',
              })}
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>

        <Outlet context={{ campaignId, role: campaign.role, isDM, isGuest: status === 'guest' }} />
      </div>
    </div>
  );
}

export function CampaignIndexRedirect() {
  const { campaignId } = useParams();
  return <Navigate to={`/campaigns/${campaignId}/encyclopedia`} replace />;
}
