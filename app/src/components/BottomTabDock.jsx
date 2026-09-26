import { NavLink } from 'react-router-dom';

// A fixed bottom dock, mobile-app style, replacing the earlier top text
// tabs (see BIBLE.md §3). Swiping left/right on the content area above
// it (wired in CampaignScreen.jsx) moves between the same tabs — the
// dock and the swipe are two ways into one navigation, not two systems.
// A single tab (a player's Scene) is nowhere to go, so no dock at all.
export function BottomTabDock({ tabs }) {
  if (tabs.length < 2) return null;
  return (
    <nav className="tab-dock" aria-label="Campaign sections">
      {tabs.map((tab) => (
        <NavLink key={tab.to} to={tab.to} className={({ isActive }) => `tab-dock-item${isActive ? ' active' : ''}`}>
          {tab.icon}
          <span>{tab.label}</span>
          {tab.badge ? (
            <span className="tab-dock-badge" aria-label={`${tab.badge} unread`}>
              {tab.badge > 9 ? '9+' : tab.badge}
            </span>
          ) : null}
        </NavLink>
      ))}
    </nav>
  );
}
