import { useEffect, useRef, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { BackButton } from '../components/BackButton.jsx';
import { BottomTabDock } from '../components/BottomTabDock.jsx';
import { BookIcon, PawIcon, QuillIcon, ShieldIcon } from '../components/ornament/TabIcons.jsx';
import { getGuestCampaign, getMyCampaign } from '../lib/campaigns.js';
import { useSession } from '../lib/SessionContext.jsx';

// Encyclopedia and Bestiary are the DM's world-building tools — lore and
// monster stats a DM authors for their own reference, not something a
// player needs a tab for. A player's whole surface is their own Notes
// and their own Character sheet, so those two tabs simply don't exist
// for them (not just locked/read-only — see BIBLE.md §4/§9).
const DM_ONLY_TABS = ['encyclopedia', 'bestiary'];

const ALL_TABS = [
  { to: 'encyclopedia', label: 'Encyclopedia', icon: <BookIcon /> },
  { to: 'notes', label: 'Notes', icon: <QuillIcon /> },
  { to: 'bestiary', label: 'Bestiary', icon: <PawIcon /> },
  { to: 'characters', label: 'Characters', icon: <ShieldIcon /> },
];

function tabsForRole(isDM) {
  return isDM ? ALL_TABS : ALL_TABS.filter((tab) => !DM_ONLY_TABS.includes(tab.to));
}

// Swipe threshold tuned to feel deliberate — a scroll or a tap-drag on a
// button shouldn't accidentally flip tabs. Horizontal motion has to
// clearly dominate vertical, and clear 60px, before it counts.
const SWIPE_THRESHOLD = 60;

function useSwipeTabs(campaignId, tabs) {
  const location = useLocation();
  const navigate = useNavigate();
  const touchStart = useRef(null);

  const currentIndex = tabs.findIndex((tab) => location.pathname.endsWith(`/${tab.to}`));

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
    if (nextIndex < 0 || nextIndex >= tabs.length) return;
    navigate(`/campaigns/${campaignId}/${tabs[nextIndex].to}`);
  }

  return { onTouchStart, onTouchEnd };
}

export function CampaignScreen() {
  const { campaignId } = useParams();
  const { status } = useSession();
  const [campaign, setCampaign] = useState(null);
  const [error, setError] = useState(null);
  // Computed off `campaign?.role` rather than after the loading/error
  // early-returns below, since hooks can't be called conditionally —
  // `false` until the campaign loads is a harmless default (the swipe
  // handlers just won't fire yet, same as while loading today).
  const tabs = tabsForRole(campaign?.role === 'dm');
  const swipeHandlers = useSwipeTabs(campaignId, tabs);

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
          <div style={{ marginTop: '1rem' }}>
            <BackButton to="/dashboard" label="Campaigns" />
          </div>
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

  // Bottom padding has to clear the taller of the two fixed overlays
  // that float over every tab here — the global dice-fab (App.jsx),
  // parked at bottom:5.5rem + 52px tall, needs ~140px of clearance from
  // the viewport bottom, more than .tab-dock itself needs. A short tab
  // (an empty Bestiary/Characters list sitting right after the example
  // cards, say) can otherwise end up with its last line permanently
  // stuck behind the fab with no amount of scrolling able to reveal it —
  // confirmed live on a 390×844 viewport. 10rem (160px) clears that with
  // margin to spare.
  return (
    <div className="screen-enter" style={{ minHeight: '100vh', padding: '2.5rem 1.5rem 10rem' }}>
      <div style={{ width: 'min(920px, 100%)', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '0.6rem' }}>
          <span className="chip chip-small">{isDM ? 'Dungeon Master' : 'Player'}</span>
        </div>

        <BackButton to="/dashboard" label="Campaigns" />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2>{campaign.name}</h2>
          {isDM && campaign.invite_code && (
            <p style={{ fontSize: '0.85rem' }}>
              Invite code: <span style={{ color: 'var(--gold-bright)', letterSpacing: '0.08em' }}>{campaign.invite_code}</span>
            </p>
          )}
        </div>

        <div
          className="swipe-area"
          style={{ marginTop: '1.75rem' }}
          onTouchStart={swipeHandlers.onTouchStart}
          onTouchEnd={swipeHandlers.onTouchEnd}
        >
          <Outlet context={{ campaignId, role: campaign.role, isDM, isGuest: status === 'guest' }} />
        </div>
      </div>

      <BottomTabDock tabs={tabs} />
    </div>
  );
}

export function CampaignIndexRedirect() {
  const { campaignId } = useParams();
  const { isDM } = useOutletContext();
  return <Navigate to={`/campaigns/${campaignId}/${isDM ? 'encyclopedia' : 'notes'}`} replace />;
}

// Guards the two DM-only tabs (Encyclopedia, Bestiary) against a player
// landing on them directly — a stale link, browser back/forward, or a
// hand-typed URL, since they're not reachable from the tab dock at all
// once tabsForRole() drops them for a player. Not a security boundary
// (RLS already owns that) — purely keeping the "players don't even see
// these" promise consistent when navigation happens outside the dock.
export function RequireDM({ children }) {
  const { campaignId } = useParams();
  const { isDM } = useOutletContext();
  if (!isDM) return <Navigate to={`/campaigns/${campaignId}/notes`} replace />;
  return children;
}
