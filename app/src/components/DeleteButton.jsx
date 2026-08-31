import { useEffect, useRef, useState } from 'react';

// The "intuitive delete" convention for every content card in the app —
// see BIBLE.md §9. Perches as a small × badge on the card's top-right
// corner (not inline among Export/Edit) rather than a labeled Delete
// button in the action row. One tap arms it (turns red, pulses, tooltip
// flips to "tap again to confirm"); a second tap actually deletes.
// Losing focus, or just not tapping again in time, quietly disarms it —
// no modal, no separate confirm screen.
//
// GUARD_MS exists so a reflexive double-tap/double-click — the same
// motor gesture that armed the button, not a deliberate second decision
// — can't land on the same spot and delete something before the user
// meant to. A confirm only counts once GUARD_MS has passed since arming;
// an earlier tap is ignored (with a little shake, so it doesn't look
// like the tap did nothing) and the confirm window keeps counting down.
const CONFIRM_WINDOW_MS = 3000;
const GUARD_MS = 450;

export function DeleteButton({ onConfirm, label = 'item' }) {
  const [confirming, setConfirming] = useState(false);
  const [shake, setShake] = useState(false);
  const timeoutRef = useRef(null);
  const shakeTimeoutRef = useRef(null);
  const armedAtRef = useRef(0);

  function reset() {
    window.clearTimeout(timeoutRef.current);
    setConfirming(false);
  }

  useEffect(
    () => () => {
      window.clearTimeout(timeoutRef.current);
      window.clearTimeout(shakeTimeoutRef.current);
    },
    [],
  );

  function handleClick() {
    if (confirming) {
      if (Date.now() - armedAtRef.current < GUARD_MS) {
        setShake(true);
        window.clearTimeout(shakeTimeoutRef.current);
        shakeTimeoutRef.current = window.setTimeout(() => setShake(false), 300);
        return;
      }
      reset();
      onConfirm();
      return;
    }
    armedAtRef.current = Date.now();
    setConfirming(true);
    timeoutRef.current = window.setTimeout(reset, CONFIRM_WINDOW_MS);
  }

  return (
    <button
      type="button"
      className={`corner-delete${confirming ? ' confirming' : ''}${shake ? ' shake' : ''}`}
      onClick={handleClick}
      onBlur={reset}
      aria-label={confirming ? `Confirm delete ${label}` : `Delete ${label}`}
      title={confirming ? 'Tap again to confirm' : `Delete ${label}`}
    >
      {confirming ? '✓' : '×'}
    </button>
  );
}
