import { useEffect, useState } from 'react';
import { applyTheme, currentTheme, THEME_EVENT } from '../lib/theme.js';

// Everything about *the table*, behind one button on the scene: Talk, the
// log, your campaign, and (for the DM) the backstage tabs. `items` are
// { key, label, badge?, onClick } — the screen decides what's offered.
export function SceneMenu({ items }) {
  const [theme, setTheme] = useState(currentTheme);
  useEffect(() => {
    const follow = (e) => setTheme(e.detail);
    window.addEventListener(THEME_EVENT, follow);
    return () => window.removeEventListener(THEME_EVENT, follow);
  }, []);

  return (
    <ul className="scene-menu">
      {items.map((item) => (
        <li key={item.key}>
          <button type="button" onClick={item.onClick}>
            <span>{item.label}</span>
            {item.badge ? <span className="party-views-badge">{item.badge > 9 ? '9+' : item.badge}</span> : <span aria-hidden="true">›</span>}
          </button>
        </li>
      ))}
      <li>
        <button type="button" onClick={() => applyTheme(theme === 'dark' ? 'light' : 'dark')}>
          <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
        </button>
      </li>
    </ul>
  );
}
