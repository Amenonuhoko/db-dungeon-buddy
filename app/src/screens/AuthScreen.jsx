import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BackButton } from '../components/BackButton.jsx';
import { FlowingDivider } from '../components/ornament/FlowingDivider.jsx';
import { Panel } from '../components/ornament/Panel.jsx';
import { usernameError } from '../lib/session.js';
import { useSession } from '../lib/SessionContext.jsx';

const USERNAME_PATTERN = '[A-Za-z0-9_-]{3,20}';

export function AuthScreen() {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  // `busy` (state) only disables the button after a re-render — a fast
  // double-tap, common on mobile, can fire a second submit before that
  // happens and land two signup/login requests in flight at once. A ref
  // flips synchronously, closing that gap regardless of render timing.
  const submitting = useRef(false);
  const { logIn, register } = useSession();
  const navigate = useNavigate();

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting.current) return;
    setError(null);
    setNotice(null);

    // There's no email on file to recover a mistyped password with (see
    // the hint below and BIBLE.md §4), which makes a signup-time typo
    // the single worst way to lose access to a brand-new account — catch
    // it here, before it ever reaches the network, rather than let
    // someone type a password once, believe it's saved, and be locked
    // out from their very next login.
    if (mode === 'signup') {
      const usernameProblem = usernameError(username);
      if (usernameProblem) {
        setError(usernameProblem);
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords don't match — check both fields.");
        return;
      }
    }

    submitting.current = true;
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
          setPassword('');
          setConfirmPassword('');
        }
      }
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      submitting.current = false;
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
              maxLength={20}
              title="3-20 letters, numbers, underscores or hyphens"
              required
              autoComplete="username"
              autoFocus
              // Login is case-insensitive, but mobile keyboards
              // auto-capitalizing the first letter of a plain text field
              // by default would still show something the person didn't
              // type — surprising even if it happens to still work.
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              // bcrypt (what Supabase hashes passwords with) only looks at
              // the first 72 bytes — capping here means what's typed is
              // always what actually matters, instead of a longer paste
              // silently having its tail ignored.
              maxLength={72}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>

          {mode === 'signup' && (
            <div className="field">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                maxLength={72}
                autoComplete="new-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
          )}

          <button
            type="button"
            className="example-toggle"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => setShowPassword((s) => !s)}
          >
            {showPassword ? 'Hide password' : 'Show password'}
          </button>

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
              setConfirmPassword('');
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
