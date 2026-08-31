import { useEffect, useRef, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { BottomTabDock } from '../components/BottomTabDock.jsx';
import { BookIcon, PawIcon, QuillIcon, ShieldIcon } from '../components/ornament/TabIcons.jsx';
import { getGuestCampaign, getMyCampaign } from '../lib/campaigns.js';
import { useSession } from '../lib/SessionContext.jsx';

const TABS = [
  { to: 'encyclopedia', label: 'Encyclopedia', icon: <BookIcon /> },
  { to: 'notes', label: 'Notes', icon: <QuillIcon /> },
  { to: 'bestiary', label: 'Bestiary', icon: <PawIcon /> },
  { to: 'characters', label: 'Characters', icon: <ShieldIcon /> },
];

// Swipe threshold tuned to feel deliberate — a scroll or a tap-drag on a
// button shouldn't accidentally flip tabs. Horizontal motion has to
// clearly dominate vertical, and clear 60px, before it counts.
const SWIPE_THRESHOLD = 60;

function useSwipeTabs(campaignId) {
  const location = useLocation();
  const navigate = useNavigate();
  const touchStart = useRef(null);

  const currentIndex = TABS.findIndex((tab) => location.pathname.endsWith(`/${tab.to}`));

  function onTouchStart(event) {
    const t = event.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  }

  function onTouchEnd(event) {
    if (!touchStart.current || currentIndex === -1) return;
    const t = event.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const nextIndex = dx < 0 ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex < 0 || nextIndex >= TABS.length) return;
    navigate(`/campaigns/${campaignId}/${TABS[nextIndex].to}`);
  }

  return { onTouchStart, onTouchEnd };
}

export function CampaignScreen() {
  const { campaignId } = useParams();
  const { status } = useSession();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [error, setError] = useState(null);
  const swipeHandlers = useSwipeTabs(campaignId);

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
    <div className="screen-enter" style={{ minHeight: '100vh', padding: '2.5rem 1.5rem 7rem' }}>
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

        <div
          className="swipe-area"
          style={{ marginTop: '1.75rem' }}
          onTouchStart={swipeHandlers.onTouchStart}
          onTouchEnd={swipeHandlers.onTouchEnd}
        >
          <Outlet context={{ campaignId, role: campaign.role, isDM, isGuest: status === 'guest' }} />
        </div>
      </div>

      <BottomTabDock tabs={TABS} />
    </div>
  );
}

export function CampaignIndexRedirect() {
  const { campaignId } = useParams();
  return <Navigate to={`/campaigns/${campaignId}/encyclopedia`} replace />;
}
