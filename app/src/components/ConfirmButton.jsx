import { useEffect, useRef, useState } from 'react';

// A labeled button for actions that need a second thought but not a
// modal — "Remove", "Leave Campaign", "Reset Link". Same two-tap idea as
// DeleteButton (BIBLE.md §9) and the sheet's rest buttons: the first tap
// swaps the label to a confirm prompt, a second tap within a few seconds
// does it, and otherwise it quietly disarms. A short guard ignores the
// reflexive double-tap that armed it.
const CONFIRM_WINDOW_MS = 3000;
const GUARD_MS = 450;

export function ConfirmButton({ onConfirm, children, confirmLabel = 'Tap again to confirm', className = 'btn btn-ghost btn-small', disabled }) {
  const [armed, setArmed] = useState(false);
  const armedAt = useRef(0);
  const timeout = useRef(null);

  useEffect(() => () => window.clearTimeout(timeout.current), []);

  function handleClick() {
    if (!armed) {
      armedAt.current = Date.now();
      setArmed(true);
      timeout.current = window.setTimeout(() => setArmed(false), CONFIRM_WINDOW_MS);
      return;
    }
    if (Date.now() - armedAt.current < GUARD_MS) return;
    window.clearTimeout(timeout.current);
    setArmed(false);
    onConfirm();
  }

  return (
    <button type="button" className={`${className}${armed ? ' confirming' : ''}`} onClick={handleClick} disabled={disabled}>
      {armed ? confirmLabel : children}
    </button>
  );
}
