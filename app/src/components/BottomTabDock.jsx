import { NavLink } from 'react-router-dom';

// A fixed bottom dock, mobile-app style, replacing the earlier top text
// tabs (see BIBLE.md §3). Swiping left/right on the content area above
// it (wired in CampaignScreen.jsx) moves between the same tabs — the
// dock and the swipe are two ways into one navigation, not two systems.
export function BottomTabDock({ tabs }) {
  return (
    <nav className="tab-dock" aria-label="Campaign sections">
      {tabs.map((tab) => (
        <NavLink key={tab.to} to={tab.to} className={({ isActive }) => `tab-dock-item${isActive ? ' active' : ''}`}>
          {tab.icon}
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
