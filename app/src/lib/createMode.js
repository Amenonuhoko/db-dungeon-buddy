import { useState } from 'react';

// Quick form or the step-by-step builder — whichever the viewer used
// last, remembered on this device.
const MODE_KEY = 'dungeonbuddy.createMode';

export function useCreateMode(fallback) {
  const [mode, setModeState] = useState(() => {
    try {
      const saved = localStorage.getItem(MODE_KEY);
      return saved === 'quick' || saved === 'guided' ? saved : fallback;
    } catch {
      return fallback;
    }
  });
  function setMode(next) {
    setModeState(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      /* private mode — just don't remember */
    }
  }
  return [mode, setMode];
}
