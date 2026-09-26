const THEME_KEY = 'codex.theme';

export function getInitialTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // localStorage unavailable (private mode, etc.) — fall through.
  }
  const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches;
  return prefersLight ? 'light' : 'dark';
}

export const THEME_EVENT = 'dungeonbuddy:theme';

export const currentTheme = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

// Every theme switch goes through here and is announced, so each toggle
// on screen (the floating one, the scene menu's) shows the right choice.
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme }));
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Nothing to persist to — the choice just won't survive a reload.
  }
}
