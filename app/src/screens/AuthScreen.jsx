import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BackButton } from '../components/BackButton.jsx';
import { FlowingDivider } from '../components/ornament/FlowingDivider.jsx';
import { Panel } from '../components/ornament/Panel.jsx';
import { displayNameError, RESEND_COOLDOWN_SECONDS } from '../lib/session.js';
import { useSession } from '../lib/SessionContext.jsx';

const TITLES = { login: 'Welcome Back', signup: 'Join Dungeon Buddy', forgot: 'Reset Password' };
const SUBMIT_LABELS = { login: 'Log In', signup: 'Sign Up', forgot: 'Send Reset Link' };

export function AuthScreen() {
  const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'forgot'
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  // Set when the one thing standing between this person and logging in
  // is an unclicked confirmation email — right after signing up, or when
  // a login comes back "not confirmed". Shows "Resend confirmation".
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  // `busy` (state) only disables the button after a re-render — a fast
  // double-tap, common on mobile, can fire a second submit before that
  // happens and land two requests in flight at once. A ref flips
  // synchronously, closing that gap regardless of render timing.
  const submitting = useRef(false);
  const { logIn, register, requestReset, resendConfirmationEmail } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const t = window.setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendCooldown]);

  function switchMode(next) {
    setMode(next);
    setNeedsConfirmation(false);
    setPassword('');
    setConfirmPassword('');
    setError(null);
    setNotice(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting.current) return;
    setError(null);
    setNotice(null);

    if (mode === 'signup') {
      // A signup-time typo used to be the single worst mistake possible
      // here, back when there was no email on file to recover a mistyped
      // password with — that's exactly what real email fixes (see
      // "Forgot password?" below and BIBLE.md §4), but catching an
      // obvious display-name problem before the network call is still
      // worth doing regardless.
      const nameProblem = displayNameError(displayName);
      if (nameProblem) {
        setError(nameProblem);
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
        await logIn(email, password);
        navigate('/dashboard');
      } else if (mode === 'signup') {
        const result = await register(email, password, displayName);
        if (result?.session) {
          // Signed in immediately — Confirm Email is off in Supabase.
          navigate('/dashboard');
        } else {
          switchMode('login');
          setNotice('Account created — check your inbox (and spam folder) for a confirmation link, then log in below.');
          setNeedsConfirmation(true);
          // Signing up just sent one — same cooldown as a manual resend.
          setResendCooldown(RESEND_COOLDOWN_SECONDS);
        }
      } else {
        await requestReset(email);
        switchMode('login');
        // Same message whether or not the address actually has an
        // account — see requestPasswordReset()'s own comment in
        // lib/session.js for why that's deliberate, not an omission.
        setNotice("If that email has an account, we've sent a link to reset its password.");
      }
    } catch (err) {
      setError(err.message || 'Something went wrong.');
      if (err.kind === 'email_not_confirmed') setNeedsConfirmation(true);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    if (!email.trim()) {
      setError('Enter the email you signed up with first.');
      return;
    }
    setError(null);
    try {
      await resendConfirmationEmail(email);
      setNotice(`Sent a fresh confirmation link to ${email.trim()} — check your inbox and spam folder.`);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(err.message || "Couldn't resend the confirmation email.");
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '1.5rem 1.5rem 9rem' }}>
      <form onSubmit={handleSubmit} className="screen-enter" style={{ width: 'min(420px, 100%)' }}>
        <BackButton to="/" />
        <h2 style={{ textAlign: 'center' }}>{TITLES[mode]}</h2>
        <div style={{ margin: '1.25rem 0' }}>
          <FlowingDivider />
        </div>

        <Panel style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {mode === 'signup' && (
            <div className="field">
              <label htmlFor="displayName">Display Name</label>
              <input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Stormcaller"
                maxLength={60}
                title="What the table sees you as — separate from your login email"
                required
                autoComplete="nickname"
                autoFocus
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
              placeholder="you@example.com"
              required
              autoComplete="email"
              autoFocus={mode !== 'signup'}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>

          {mode !== 'forgot' && (
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                // bcrypt (what Supabase hashes passwords with) only looks
                // at the first 72 bytes — capping here means what's typed
                // is always what actually matters, instead of a longer
                // paste silently having its tail ignored.
                maxLength={72}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
          )}

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

          {mode !== 'forgot' && (
            <button
              type="button"
              className="example-toggle"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => setShowPassword((s) => !s)}
            >
              {showPassword ? 'Hide password' : 'Show password'}
            </button>
          )}

          {mode === 'login' && (
            <button
              type="button"
              className="example-toggle"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => switchMode('forgot')}
            >
              Forgot password?
            </button>
          )}

          {mode === 'forgot' && (
            <p className="hint-text">We'll email a link to set a new password.</p>
          )}

          {error && <p className="error-text">{error}</p>}
          {notice && <p className="notice-text">{notice}</p>}

          {needsConfirmation && mode === 'login' && (
            <button
              type="button"
              className="example-toggle"
              style={{ alignSelf: 'flex-start' }}
              onClick={handleResend}
              disabled={resendCooldown > 0}
            >
              {resendCooldown > 0 ? `Resend confirmation email (${resendCooldown}s)` : 'Resend confirmation email'}
            </button>
          )}

          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Working…' : SUBMIT_LABELS[mode]}
          </button>

          {mode === 'forgot' ? (
            <button className="btn btn-ghost" type="button" onClick={() => switchMode('login')}>
              Back to log in
            </button>
          ) : (
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
            >
              {mode === 'login' ? 'Need an account? Sign up' : 'Already have an account? Log in'}
            </button>
          )}
        </Panel>
      </form>
    </div>
  );
}
