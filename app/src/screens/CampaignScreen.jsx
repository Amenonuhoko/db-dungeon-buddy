import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { BackButton } from '../components/BackButton.jsx';
import { BottomTabDock } from '../components/BottomTabDock.jsx';
import { CampaignSettings } from '../components/CampaignSettings.jsx';
import { InvitePanel } from '../components/InvitePanel.jsx';
import { TableToasts } from '../components/TableToasts.jsx';
import { GearIcon } from '../components/ornament/UtilityIcons.jsx';
import { ALL_TABS, tabsForRole } from '../lib/campaignTabs.jsx';
import { getGuestCampaign, getMyCampaign, regenerateInviteCode } from '../lib/campaigns.js';
import { listSheets, tableName } from '../lib/characters.js';
import { useWornCharacters } from '../lib/live.js';
import { TABLE_THREAD, useTableTalk } from '../lib/messages.js';
import { useCampaignPresence, usePresenceEvents } from '../lib/presence.js';
import { useViewAsPlayer } from '../lib/viewAs.js';
import { useSession } from '../lib/SessionContext.jsx';

// Reopening a campaign lands on whichever tab you were last on (per
// campaign, per device). First visit lands on the Scene.
const lastTabKey = (campaignId) => `dungeonbuddy.lastTab.${campaignId}`;

function readLastTab(campaignId) {
  try {
    return localStorage.getItem(lastTabKey(campaignId));
  } catch {
    return null;
  }
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
  const { status, user } = useSession();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [error, setError] = useState(null);
  // Computed off `campaign?.role` rather than after the loading/error
  // early-returns below, since hooks can't be called conditionally —
  // `false` until the campaign loads is a harmless default (the swipe
  // handlers just won't fire yet, same as while loading today).
  // A DM can preview the campaign as a player (lib/viewAs.js): the
  // player's Scene and flows, with the database still treating them
  // as the DM. isRealDM keeps campaign management (invite, settings)
  // working either way.
  const [viewAsPlayer, setViewAsPlayer] = useViewAsPlayer(campaignId);
  const isRealDM = campaign?.role === 'dm';
  const previewAsPlayer = isRealDM && viewAsPlayer;
  const tabs = tabsForRole(isRealDM && !viewAsPlayer);
  const swipeHandlers = useSwipeTabs(campaignId, tabs);
  const location = useLocation();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // --- The live table (account mode): who's here, and Table Talk. Held
  // here, once per campaign, so the Scene, the tab badge and the
  // toasts all share one view of it. See lib/presence.js, lib/messages.js.
  const live = status === 'authenticated' && Boolean(campaign);
  const currentTab = ALL_TABS.find((t) => location.pathname.endsWith(`/${t.to}`))?.to || 'scene';
  const me = useMemo(
    () => (user ? { userId: user.id, name: user.user_metadata?.display_name || 'Adventurer', role: campaign?.role } : null),
    [user, campaign?.role],
  );
  const presence = useCampaignPresence(live, campaignId, me, `tab:${currentTab}`);
  const worn = useWornCharacters(live, campaignId, listSheets);

  const [toasts, setToasts] = useState([]);
  const dismissToast = useCallback((id) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);
  const pushToast = useCallback(
    (toast) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev.slice(-2), { id, ...toast }]);
      window.setTimeout(() => dismissToast(id), 5000);
    },
    [dismissToast],
  );

  usePresenceEvents(live, campaignId, (event) => {
    const who = tableName(event.who.name, worn[event.who.userId]);
    pushToast({
      kind: event.type,
      title: event.type === 'join' ? `${who} sat down at the table` : `${who} stepped away`,
    });
  });

  const talk = useTableTalk(live, campaignId, user?.id, (message, thread) => {
    const from = tableName(presence.online[message.senderId]?.name || 'Someone', worn[message.senderId]);
    pushToast({
      kind: 'message',
      title: thread === TABLE_THREAD ? `${from} to the table` : `${from} whispered to you`,
      body: message.body.length > 90 ? `${message.body.slice(0, 90)}…` : message.body,
      onOpen: () => navigate(`/campaigns/${campaignId}/scene?panel=talk&thread=${thread}`),
    });
  });

  useEffect(() => {
    const tab = ALL_TABS.find((t) => location.pathname.endsWith(`/${t.to}`));
    if (!tab) return;
    try {
      localStorage.setItem(lastTabKey(campaignId), tab.to);
    } catch {
      // Private mode / storage blocked — just lands on the Scene next time.
    }
  }, [location.pathname, campaignId]);

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
        .catch((err) => setError(err.message || "You don't have access to that campaign."));
    }
  }, [status, campaignId]);

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '1.5rem 1.5rem 9rem' }}>
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
        <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--text-dim)' }}>
          Opening the campaign…
        </p>
      </div>
    );
  }

  const isDM = isRealDM && !viewAsPlayer;
  // Guest campaigns are device-local — there's no one to invite to them.
  const canInvite = isRealDM && Boolean(campaign.invite_code);

  const outletContext = {
    campaignId,
    campaign,
    role: isDM ? 'dm' : 'player',
    isDM,
    isRealDM,
    previewAsPlayer,
    setViewAsPlayer,
    isGuest: status === 'guest',
    presence,
    talk,
    worn,
    canInvite,
    resetInvite: async () => {
      const code = await regenerateInviteCode(campaign.id);
      setCampaign((prev) => ({ ...prev, invite_code: code }));
    },
    onCampaignUpdated: setCampaign,
    openInvite: canInvite
      ? () => {
          setInviteOpen(true);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      : null,
  };

  // The Scene is the whole screen (BIBLE.md §1, "The companion
  // principle"): no header, tabs or padding — it brings its own menu.
  if (location.pathname.endsWith('/scene')) {
    return (
      <>
        <Outlet context={outletContext} />
        <TableToasts toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

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
        <div className="campaign-topbar">
          <BackButton to="/dashboard" label="Campaigns" />
          {isRealDM ? (
            <button
              type="button"
              className={`chip chip-small view-as-toggle${previewAsPlayer ? ' active' : ''}`}
              onClick={() => setViewAsPlayer(!viewAsPlayer)}
              aria-pressed={previewAsPlayer}
              title={previewAsPlayer ? 'Back to your DM view' : 'See the campaign the way your players do'}
            >
              {previewAsPlayer ? 'Player View' : 'View as Player'}
            </button>
          ) : (
            <span className="chip chip-small">Player</span>
          )}
        </div>

        {previewAsPlayer && (
          <div className="view-as-banner" role="status">
            <span>
              <strong>Viewing as a player.</strong> You're still the DM behind the scenes — anything you do here really
              happens.
            </span>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setViewAsPlayer(false)}>
              Back to DM View
            </button>
          </div>
        )}

        <div className="campaign-titlebar">
          <h2>{campaign.name}</h2>
          <div className="campaign-titlebar-actions">
            {canInvite && !previewAsPlayer && (
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => {
                  setInviteOpen((o) => !o);
                  setSettingsOpen(false);
                }}
                aria-expanded={inviteOpen}
              >
                Invite Players
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-small btn-icon"
              onClick={() => {
                setSettingsOpen((o) => !o);
                setInviteOpen(false);
              }}
              aria-expanded={settingsOpen}
              aria-label="Campaign settings"
              title="Campaign settings"
            >
              <GearIcon />
            </button>
          </div>
        </div>
        {campaign.description && <p className="campaign-description">{campaign.description}</p>}

        {canInvite && inviteOpen && (
          <div style={{ marginTop: '1rem' }}>
            <InvitePanel
              code={campaign.invite_code}
              campaignName={campaign.name}
              onClose={() => setInviteOpen(false)}
              onReset={outletContext.resetInvite}
            />
          </div>
        )}

        {settingsOpen && (
          <div style={{ marginTop: '1rem' }}>
            <CampaignSettings
              campaign={campaign}
              isDM={isRealDM}
              isGuest={status === 'guest'}
              onUpdated={setCampaign}
              onClose={() => setSettingsOpen(false)}
            />
          </div>
        )}

        <div
          className="swipe-area"
          style={{ marginTop: '1.75rem' }}
          onTouchStart={swipeHandlers.onTouchStart}
          onTouchEnd={swipeHandlers.onTouchEnd}
        >
          <Outlet context={outletContext} />
        </div>
      </div>

      <TableToasts toasts={toasts} onDismiss={dismissToast} />
      <BottomTabDock tabs={tabs.map((t) => (t.to === 'scene' && talk.totalUnread ? { ...t, badge: talk.totalUnread } : t))} />
    </div>
  );
}

export function CampaignIndexRedirect() {
  const { campaignId } = useParams();
  const { isDM } = useOutletContext();
  const last = readLastTab(campaignId);
  const allowed = tabsForRole(isDM).some((t) => t.to === last);
  return <Navigate to={`/campaigns/${campaignId}/${allowed ? last : 'scene'}`} replace />;
}

// Guards the DM-only tabs (Lore, Monsters, Notes) against a player
// landing on them directly — a stale link, browser back/forward, or a
// hand-typed URL, since they're not reachable from the tab dock at all
// once tabsForRole() drops them for a player. Not a security boundary
// (RLS already owns that) — purely keeping the "players don't even see
// these" promise consistent when navigation happens outside the dock.
export function RequireDM({ children }) {
  const { campaignId } = useParams();
  const { isDM } = useOutletContext();
  if (!isDM) return <Navigate to={`/campaigns/${campaignId}/scene`} replace />;
  return children;
}
