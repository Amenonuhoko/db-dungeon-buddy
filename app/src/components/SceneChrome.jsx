import { useEffect } from 'react';

// The few pieces of chrome the full-screen scene allows itself: sheets
// that slide up over the picture, round icon buttons, and the moments
// layer (captions, "Your turn!"). See BIBLE.md §1, "The companion
// principle".

const icon = { viewBox: '0 0 24 24', width: 24, height: 24, fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };

export function MenuIcon() {
  return (
    <svg {...icon}>
      <path d="M5 7 H19 M5 12 H19 M5 17 H19" />
    </svg>
  );
}

export function BackpackIcon() {
  return (
    <svg {...icon}>
      <path d="M8 7 V5.5 C8 4.1 9.8 3 12 3 C14.2 3 16 4.1 16 5.5 V7" />
      <path d="M5.5 11 C5.5 8.5 7.5 7 12 7 C16.5 7 18.5 8.5 18.5 11 V19 C18.5 20.1 17.6 21 16.5 21 H7.5 C6.4 21 5.5 20.1 5.5 19 Z" />
      <path d="M9 14 H15 V17 H9 Z" />
    </svg>
  );
}

export function ToolboxIcon() {
  return (
    <svg {...icon}>
      <path d="M4 10 H20 V19 C20 19.6 19.6 20 19 20 H5 C4.4 20 4 19.6 4 19 Z" />
      <path d="M9 10 V6.5 C9 5.7 9.7 5 10.5 5 H13.5 C14.3 5 15 5.7 15 6.5 V10" />
      <path d="M4 14 H20 M10.5 13 V15.5 M13.5 13 V15.5" />
    </svg>
  );
}

export function SceneButton({ label, onClick, badge, children, active }) {
  return (
    <button type="button" className={`scene-fab${active ? ' active' : ''}`} onClick={onClick} aria-label={label} title={label}>
      {children}
      {badge ? <span className="scene-fab-badge">{badge > 9 ? '9+' : badge}</span> : null}
    </button>
  );
}

// A sheet sliding up over the scene. Escape or a tap on the dimmed scene
// closes it; the scene stays visible above it.
export function SceneSheet({ title, onClose, onBack, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="scene-sheet-layer">
      <button type="button" className="scene-sheet-backdrop" aria-label="Close" onClick={onClose} />
      <section className="scene-sheet" role="dialog" aria-label={title}>
        <header className="scene-sheet-head">
          {onBack ? (
            <button type="button" className="scene-sheet-nav" onClick={onBack} aria-label="Back">
              ←
            </button>
          ) : (
            <span className="scene-sheet-grip" aria-hidden="true" />
          )}
          <h3>{title}</h3>
          <button type="button" className="scene-sheet-nav" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="scene-sheet-body">{children}</div>
      </section>
    </div>
  );
}

export function MomentLayer({ captions, yourTurn }) {
  return (
    <>
      {yourTurn > 0 && (
        <div className="scene-your-turn" key={yourTurn} role="status">
          Your turn!
        </div>
      )}
      <div className="scene-captions" aria-live="polite">
        {captions.map((c) => (
          <p key={c.id} className="scene-caption">
            {c.text}
          </p>
        ))}
      </div>
    </>
  );
}
