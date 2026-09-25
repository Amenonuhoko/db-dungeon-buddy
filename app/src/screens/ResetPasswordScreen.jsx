import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BackButton } from '../components/BackButton.jsx';
import { FlowingDivider } from '../components/ornament/FlowingDivider.jsx';
import { Panel } from '../components/ornament/Panel.jsx';
import { getAuthRedirectError } from '../lib/session.js';
import { useSession } from '../lib/SessionContext.jsx';

// Landed on by clicking the link a password-reset email sends
// (requestPasswordReset() in lib/session.js points it here). supabase-js
// detects the link's token in the URL on load and exchanges it for a
// real session automatically — no extra wiring needed here, since
// SessionContext's own onAuthStateChange listener picks that up exactly
// like a normal login and flips `status` to 'authenticated'. That also
// means an already-logged-in user landing here (say, by navigating back
// to this URL) can use this screen too — harmless, since setting your
// own password is always allowed for whoever's already authenticated as
// you, recovery link or not.
export function ResetPasswordScreen() {
  const { status, setNewPassword } = useSession();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const navigate = useNavigate();

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting.current) return;
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords don't match — check both fields.");
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      await setNewPassword(password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '1.5rem 1.5rem 9rem' }}>
      <div className="screen-enter" style={{ width: 'min(420px, 100%)' }}>
        <BackButton to="/" />
        <h2 style={{ textAlign: 'center' }}>Set a New Password</h2>
        <div style={{ margin: '1.25rem 0' }}>
          <FlowingDivider />
        </div>

        <Panel style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {status === 'loading' && <p style={{ textAlign: 'center' }}>Checking your link…</p>}

          {(status === 'signed-out' || status === 'guest') && (
            <>
              <p className="error-text" style={{ textAlign: 'center' }}>
                {getAuthRedirectError() || 'This link is invalid or has expired.'}
              </p>
              <button className="btn btn-primary" type="button" onClick={() => navigate('/login')}>
                Request a New Link
              </button>
            </>
          )}

          {status === 'authenticated' && (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="field">
                <label htmlFor="newPassword">New Password</label>
                <input
                  id="newPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  maxLength={72}
                  autoComplete="new-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoFocus
                />
              </div>
              <div className="field">
                <label htmlFor="confirmNewPassword">Confirm New Password</label>
                <input
                  id="confirmNewPassword"
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

              <button
                type="button"
                className="example-toggle"
                style={{ alignSelf: 'flex-start' }}
                onClick={() => setShowPassword((s) => !s)}
              >
                {showPassword ? 'Hide password' : 'Show password'}
              </button>

              {error && <p className="error-text">{error}</p>}

              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? 'Working…' : 'Set Password'}
              </button>
            </form>
          )}
        </Panel>
      </div>
    </div>
  );
}
