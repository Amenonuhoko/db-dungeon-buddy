import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BackButton } from '../components/BackButton.jsx';
import { FlowingDivider } from '../components/ornament/FlowingDivider.jsx';
import { Panel } from '../components/ornament/Panel.jsx';
import { useSession } from '../lib/SessionContext.jsx';

const USERNAME_PATTERN = '[A-Za-z0-9_-]{3,20}';

export function AuthScreen() {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
        await logIn(username, password);
        navigate('/dashboard');
      } else {
        const result = await register(username, password);
        if (result?.session) {
          // Signed in immediately — this is the expected path once
          // "Confirm email" is off in Supabase (see BIBLE.md §4).
          navigate('/dashboard');
        } else {
          setNotice(
            'Account created, but you were not signed in automatically. Turn off "Confirm email" under Authentication → Providers → Email in your Supabase project, then log in below.',
          );
          setMode('login');
        }
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
        <BackButton to="/" />
        <h2 style={{ textAlign: 'center' }}>{mode === 'login' ? 'Welcome Back' : 'Join the Codex'}</h2>
        <div style={{ margin: '1.25rem 0' }}>
          <FlowingDivider />
        </div>

        <Panel style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="stormcaller"
              pattern={USERNAME_PATTERN}
              title="3-20 letters, numbers, underscores or hyphens"
              required
              autoComplete="username"
              autoFocus
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

          {mode === 'signup' && (
            <p className="hint-text">No email on file means no password recovery — pick one you'll remember.</p>
          )}

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
        </Panel>
      </form>
    </div>
  );
}
