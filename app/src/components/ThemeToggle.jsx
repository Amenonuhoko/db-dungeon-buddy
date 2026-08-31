import { useEffect, useState } from 'react';
import { applyTheme, getInitialTheme } from '../lib/theme.js';

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="12" cy="12" r="4.4" />
      <path d="M12 2.5 C11.6 4.5 11.6 5.6 12 6.8" />
      <path d="M12 17.2 C11.6 19 11.6 20 12 21.5" />
      <path d="M21.5 12 C19.5 11.6 18.4 11.6 17.2 12" />
      <path d="M6.8 12 C5 11.6 4 11.6 2.5 12" />
      <path d="M18.5 5.5 C17.2 6.8 16.6 7.6 16 8.8" />
      <path d="M8 15.2 C7.2 16.4 6.6 17.2 5.5 18.5" />
      <path d="M18.5 18.5 C17.2 17.2 16.6 16.4 16 15.2" />
      <path d="M8 8.8 C7.2 7.6 6.6 6.8 5.5 5.5" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M20 14.2 C17.8 16.2 14.9 16.6 12.3 15.2 C9.2 13.6 7.6 10 8.6 6.6 C9 5.2 9.8 4 10.8 3.1 C6.2 3.9 3 8 3 12.6 C3 17.8 7.2 22 12.4 22 C16.4 22 19.8 19.5 21.1 16 C20.7 15.4 20.3 14.8 20 14.2 Z" />
    </svg>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={theme === 'dark' ? 'Switch to light (ivory) mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
