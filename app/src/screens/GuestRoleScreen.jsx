import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BackButton } from '../components/BackButton.jsx';
import { FlowingDivider } from '../components/ornament/FlowingDivider.jsx';
import { Panel } from '../components/ornament/Panel.jsx';
import { useSession } from '../lib/SessionContext.jsx';

const ROLES = [
  {
    id: 'dm',
    title: 'Dungeon Master',
    blurb: 'Build the world, run the bestiary, track the battle.',
  },
  {
    id: 'player',
    title: 'Player',
    blurb: 'Your character sheet, your notes — nothing else to dig through.',
  },
];

export function GuestRoleScreen() {
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState(null);
  const { continueAsGuest } = useSession();
  const navigate = useNavigate();

  const canEnter = displayName.trim().length > 0 && role;

  function handleSubmit(event) {
    event.preventDefault();
    if (!canEnter) return;
    continueAsGuest(displayName.trim(), role);
    navigate('/dashboard');
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '1.5rem 1.5rem 9rem' }}>
      <form onSubmit={handleSubmit} className="screen-enter" style={{ width: 'min(520px, 100%)' }}>
        <BackButton to="/" />
        <h2 style={{ textAlign: 'center' }}>Enter the Table</h2>
        <div style={{ margin: '1.25rem 0' }}>
          <FlowingDivider />
        </div>

        <Panel style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="field">
            <label htmlFor="displayName">What should we call you?</label>
            <input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Adventurer name"
              autoFocus
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {ROLES.map((r) => (
              <button
                type="button"
                key={r.id}
                onClick={() => setRole(r.id)}
                className={role === r.id ? 'corner-frame' : ''}
                style={{
                  background: role === r.id ? 'var(--surface)' : 'transparent',
                  border: `1px solid ${role === r.id ? 'var(--gold)' : 'var(--line)'}`,
                  borderRadius: 'var(--radius)',
                  padding: '1.25rem 1rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: 'var(--text)',
                }}
              >
                <div style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>{r.title}</div>
                <p style={{ marginTop: '0.4rem', fontSize: '0.85rem' }}>{r.blurb}</p>
              </button>
            ))}
          </div>

          <button className="btn btn-primary" type="submit" disabled={!canEnter}>
            Enter as Guest
          </button>
        </Panel>
      </form>
    </div>
  );
}
