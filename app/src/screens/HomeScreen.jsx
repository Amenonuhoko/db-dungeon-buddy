import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FlowingDivider } from '../components/ornament/FlowingDivider.jsx';
import { LaurelFlourish } from '../components/ornament/Laurel.jsx';
import { Panel } from '../components/ornament/Panel.jsx';
import { useSession } from '../lib/SessionContext.jsx';
import { hasBackend } from '../lib/supabase.js';

export function HomeScreen() {
  const { status } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === 'guest' || status === 'authenticated') {
      navigate('/dashboard', { replace: true });
    }
  }, [status, navigate]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '1.5rem',
      }}
    >
      <div className="screen-enter" style={{ width: 'min(480px, 100%)', textAlign: 'center' }}>
        <div className="glow" aria-hidden="true" style={{ marginBottom: '1.25rem' }}>
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width="88" height="88" />
        </div>

        <LaurelFlourish>
          <h1 style={{ fontSize: '2.25rem' }}>CODEX</h1>
        </LaurelFlourish>

        <p style={{ marginTop: '0.75rem' }}>A companion for the whole table — DM or player.</p>

        <div style={{ margin: '1.75rem 0' }}>
          <FlowingDivider />
        </div>

        <Panel corners topRule style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <button
            className="btn btn-primary"
            onClick={() => navigate('/login')}
            disabled={!hasBackend}
            title={hasBackend ? undefined : 'Account login needs a configured backend'}
          >
            Log In / Sign Up
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => navigate('/join')}
            disabled={!hasBackend}
            title={hasBackend ? undefined : 'Joining a campaign needs a configured backend'}
          >
            Join a Campaign
          </button>
          {!hasBackend && (
            <p style={{ fontSize: '0.8rem' }}>
              Running without a backend — see BIBLE.md §2 to add one. Guest mode below still works fully.
            </p>
          )}
          <button className="btn btn-ghost" onClick={() => navigate('/guest')}>
            Continue as Guest
          </button>
        </Panel>
      </div>
    </div>
  );
}
