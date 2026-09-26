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

export function SelectIcon() {
  return (
    <svg {...icon}>
      <path d="M5 4 L5 17 L8.6 13.6 L11.2 19.5 L13.6 18.4 L11 12.6 L16 12.3 Z" />
      <path d="M15 4 H20 V9 M20 15 V20 H15" strokeDasharray="2 2.2" />
    </svg>
  );
}

export function RulerIcon() {
  return (
    <svg {...icon}>
      <path d="M3.5 16.5 L16.5 3.5 L20.5 7.5 L7.5 20.5 Z" />
      <path d="M7 13 L9 15 M10 10 L11.5 11.5 M13 7 L15 9" />
    </svg>
  );
}

function SceneIcon() {
  return (
    <svg {...icon}>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M3.5 16 L9 11 L13 14.5 L15.5 12.5 L20.5 16.5" />
      <circle cx="15.5" cy="9" r="1.5" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg {...icon}>
      <path d="M4 6.5 L9 4.5 L15 6.5 L20 4.5 V17.5 L15 19.5 L9 17.5 L4 19.5 Z" />
      <path d="M9 4.5 V17.5 M15 6.5 V19.5" />
    </svg>
  );
}

function MoodIcon() {
  return (
    <svg {...icon}>
      <circle cx="9" cy="9" r="3.2" />
      <path d="M9 3 V4.2 M3 9 H4.2 M4.8 4.8 L5.6 5.6 M13.2 4.8 L12.4 5.6" />
      <path d="M8.5 19 H17.5 C19.4 19 21 17.6 21 15.8 C21 14 19.5 12.6 17.7 12.7 C17.1 10.9 15.4 9.8 13.5 10 C11.6 10.2 10.2 11.8 10.1 13.6 C8.9 13.6 7.5 14.6 7.5 16.3 C7.5 17.5 7.9 18.4 8.5 19 Z" />
    </svg>
  );
}

function PartyIcon() {
  return (
    <svg {...icon}>
      <circle cx="8" cy="8" r="3" />
      <circle cx="16.5" cy="9" r="2.5" />
      <path d="M2.5 19 C3 15.5 5.3 13.5 8 13.5 C10.7 13.5 13 15.5 13.5 19" />
      <path d="M14 14.2 C14.8 13.6 15.6 13.4 16.5 13.4 C19 13.4 20.8 15.2 21.3 18" />
    </svg>
  );
}

function AnnounceIcon() {
  return (
    <svg {...icon}>
      <path d="M4 10 V14 H7 L15 18.5 V5.5 L7 10 Z" />
      <path d="M7 14 L8.5 19 H10.5 L9.4 14.9" />
      <path d="M18 9 C19.3 10.2 19.3 13.8 18 15 M20 7 C22.3 9.4 22.3 14.6 20 17" />
    </svg>
  );
}

function LookupIcon() {
  return (
    <svg {...icon}>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15 L20.5 20.5" />
      <path d="M8 9 H13 M8 12 H11.5" />
    </svg>
  );
}

function FightIcon() {
  return (
    <svg {...icon}>
      <path d="M5 4 L14.5 13.5 M19 4 L9.5 13.5" />
      <path d="M12.5 15.5 L16.5 11.5 M14.5 13.5 L19 18 M17.5 19.5 L20 17" />
      <path d="M11.5 15.5 L7.5 11.5 M9.5 13.5 L5 18 M6.5 19.5 L4 17" />
    </svg>
  );
}

const QUICK = [
  { id: 'scene', label: 'Scene', Icon: SceneIcon },
  { id: 'map', label: 'Map', Icon: MapIcon },
  { id: 'mood', label: 'Mood', Icon: MoodIcon },
  { id: 'party', label: 'Party', Icon: PartyIcon },
  { id: 'announce', label: 'Announce', Icon: AnnounceIcon },
  { id: 'lookup', label: 'Look up', Icon: LookupIcon },
  { id: 'fight', label: 'Fight', Icon: FightIcon },
];

// The DM's quick bar: everything a DM reaches for mid-session, one tap
// from the scene, each opening a sheet of presets.
export function QuickBar({ onPick, active, fightOn }) {
  return (
    <nav className="quick-bar" aria-label="DM quick actions">
      {QUICK.map(({ id, label, Icon }) => (
        <button key={id} type="button" className={`quick-bar-item${active === id ? ' active' : ''}${id === 'fight' && fightOn ? ' live' : ''}`} onClick={() => onPick(id)}>
          <Icon />
          <span>{label}</span>
        </button>
      ))}
    </nav>
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

export function MomentLayer({ captions, yourTurn, call, titleCard, handout, onCloseHandout }) {
  return (
    <>
      {yourTurn > 0 && (
        <div className="scene-your-turn" key={yourTurn} role="status">
          Your turn!
        </div>
      )}
      {titleCard && (
        <div className="scene-title-card" key={titleCard.id} role="status">
          <h2>{titleCard.text}</h2>
          {titleCard.body && <p>{titleCard.body}</p>}
        </div>
      )}
      {call && (
        <div className="scene-call" key={call.id} role="status">
          {call.aimed && <span className="scene-call-aimed">Just for you</span>}
          <strong>{call.text}</strong>
        </div>
      )}
      <div className="scene-captions" aria-live="polite">
        {captions.map((c) => (
          <p key={c.id} className="scene-caption">
            {c.text}
          </p>
        ))}
      </div>
      {handout && (
        <div className="scene-handout-layer">
          <article className="scene-handout" role="dialog" aria-label={handout.text}>
            {handout.aimed && <span className="scene-call-aimed">Just for you</span>}
            <h2>{handout.text}</h2>
            {handout.body && <div className="scene-handout-body">{handout.body}</div>}
            <button type="button" className="btn btn-primary btn-small" onClick={onCloseHandout}>
              Put It Away
            </button>
          </article>
        </div>
      )}
    </>
  );
}
