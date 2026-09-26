import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FlowingDivider } from '../components/ornament/FlowingDivider.jsx';
import { LaurelFlourish } from '../components/ornament/Laurel.jsx';
import { Panel } from '../components/ornament/Panel.jsx';
import { dismissAuthRedirectError, getAuthRedirectError } from '../lib/session.js';
import { useSession } from '../lib/SessionContext.jsx';
import { hasBackend, supabaseConfigError } from '../lib/supabase.js';

export function HomeScreen() {
  const { status } = useSession();
  const navigate = useNavigate();
  // An expired/used confirmation link lands here — say so instead of
  // leaving the visitor staring at the normal Home screen (see
  // authRedirect in lib/supabase.js).
  const [linkError, setLinkError] = useState(getAuthRedirectError);

  function closeLinkError() {
    dismissAuthRedirectError();
    setLinkError(null);
  }

  useEffect(() => {
    if (status === 'guest' || status === 'authenticated') {
      navigate('/dashboard', { replace: true });
    }
  }, [status, navigate]);

  return (
    <div
      className="home-screen"
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        // Bottom room for the floating dice button, so it never sits on
        // top of the last choice (same reasoning as the campaign screens).
        padding: '1.5rem 1.5rem 9rem',
      }}
    >
      <div className="screen-enter" style={{ width: 'min(480px, 100%)', textAlign: 'center' }}>
        <div className="glow" aria-hidden="true" style={{ marginBottom: '0.75rem' }}>
          {/* The mascot (public/mascot.png) — the source of the whole
              look, BIBLE.md §3. */}
          <img className="home-hero" src={`${import.meta.env.BASE_URL}mascot.png`} alt="" width="512" height="512" />
        </div>

        <LaurelFlourish>
          <h1 className="wordmark">
            <span>Dungeon</span>
            <span>Buddy</span>
          </h1>
        </LaurelFlourish>

        <p style={{ marginTop: '0.75rem' }}>Your table's companion — run the game, play the game, skip the paperwork.</p>

        <div style={{ margin: '1.75rem 0' }}>
          <FlowingDivider />
        </div>

        <Panel corners topRule style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          {linkError && (
            <div className="auth-link-error" role="alert">
              <p className="error-text">{linkError}</p>
              <button type="button" className="condition-chip-remove" onClick={closeLinkError} aria-label="Dismiss">
                ×
              </button>
            </div>
          )}

          {/* Every choice says, in one line, what it's for — three buttons
              with no explanation made a newcomer guess which one they
              wanted before they could even start. */}
          <Choice
            primary
            label="Log In or Sign Up"
            hint="Run or play campaigns, synced across all your devices."
            disabled={!hasBackend}
            onClick={() => {
              closeLinkError();
              navigate('/login');
            }}
          />
          <Choice
            label="Join a Game"
            hint="Got an invite from your DM? Jump in — no account needed."
            disabled={!hasBackend}
            onClick={() => navigate('/join')}
          />
          <Choice
            label="Play Offline"
            hint="Try everything on this device. Nothing leaves it."
            onClick={() => navigate('/guest')}
          />

          {!hasBackend && (
            // A specific, actionable reason (a malformed env var) beats the
            // generic message whenever one is available — see lib/supabase.js.
            <p style={{ fontSize: '0.8rem' }}>
              {supabaseConfigError ||
                'Online play needs a backend — see BIBLE.md §2 to add one. Offline play works fully.'}
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Choice({ label, hint, onClick, disabled = false, primary = false }) {
  return (
    <div className="home-choice">
      <button className={`btn ${primary ? 'btn-primary' : 'btn-ghost'}`} onClick={onClick} disabled={disabled}>
        {label}
      </button>
      <p className="home-choice-hint">{hint}</p>
    </div>
  );
}
