import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FlowingDivider } from '../components/ornament/FlowingDivider.jsx';
import { Panel } from '../components/ornament/Panel.jsx';
import { useSession } from '../lib/SessionContext.jsx';

export function AuthScreen() {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const { logIn, register } = useSession();
  const navigate = useNavigate();

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        await logIn(email, password);
        navigate('/dashboard');
      } else {
        await register(email, password, displayName.trim());
        setNotice('Account created — check your email to confirm, then log in.');
        setMode('login');
      }
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '1.5rem' }}>
      <form onSubmit={handleSubmit} className="screen-enter" style={{ width: 'min(420px, 100%)' }}>
        <h2 style={{ textAlign: 'center' }}>{mode === 'login' ? 'Welcome Back' : 'Join the Codex'}</h2>
        <div style={{ margin: '1.25rem 0' }}>
          <FlowingDivider />
        </div>

        <Panel style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {mode === 'signup' && (
            <div className="field">
              <label htmlFor="displayName">Display name</label>
              <input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </div>
          )}

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {error && <p className="error-text">{error}</p>}
          {notice && <p className="error-text">{notice}</p>}

          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Working…' : mode === 'login' ? 'Log In' : 'Sign Up'}
          </button>

          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login');
              setError(null);
              setNotice(null);
            }}
          >
            {mode === 'login' ? 'Need an account? Sign up' : 'Already have an account? Log in'}
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => navigate('/')}>
            Back
          </button>
        </Panel>
      </form>
    </div>
  );
}
