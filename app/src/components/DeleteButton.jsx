import { useEffect, useRef, useState } from 'react';

// The "intuitive delete" convention for every content card in the app —
// see BIBLE.md §9. Perches as a small × badge on the card's top-right
// corner (not inline among Export/Edit) rather than a labeled Delete
// button in the action row. One tap arms it (turns red, pulses, tooltip
// flips to "tap again to confirm"); a second tap within CONFIRM_WINDOW_MS
// actually deletes. Losing focus, or just not tapping again in time,
// quietly disarms it — no modal, no separate confirm screen.
const CONFIRM_WINDOW_MS = 2500;

export function DeleteButton({ onConfirm, label = 'item' }) {
  const [confirming, setConfirming] = useState(false);
  const timeoutRef = useRef(null);

  function reset() {
    window.clearTimeout(timeoutRef.current);
    setConfirming(false);
  }

  useEffect(() => () => window.clearTimeout(timeoutRef.current), []);

  function handleClick() {
    if (confirming) {
      reset();
      onConfirm();
      return;
    }
    setConfirming(true);
    timeoutRef.current = window.setTimeout(reset, CONFIRM_WINDOW_MS);
  }

  return (
    <button
      type="button"
      className={`corner-delete${confirming ? ' confirming' : ''}`}
      onClick={handleClick}
      onBlur={reset}
      aria-label={confirming ? `Confirm delete ${label}` : `Delete ${label}`}
      title={confirming ? 'Tap again to confirm' : `Delete ${label}`}
    >
      {confirming ? '✓' : '×'}
    </button>
  );
}
