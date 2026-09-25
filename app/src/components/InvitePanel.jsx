import { useState } from 'react';
import { ConfirmButton } from './ConfirmButton.jsx';
import { Panel } from './ornament/Panel.jsx';

// A link a player can just tap, instead of a code the DM reads aloud and
// the player types in. Opening it lands on the Join screen with the code
// already filled in (JoinCampaignScreen reads ?code=), so the player only
// has to give a name.
function inviteLink(code) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${window.location.origin}${base}/join?code=${encodeURIComponent(code)}`;
}

export function InvitePanel({ code, campaignName, onClose, onReset }) {
  const [copied, setCopied] = useState(false);
  const [resetError, setResetError] = useState(null);
  const [resetting, setResetting] = useState(false);

  // A link that's been posted somewhere public, or a player the DM has
  // removed, shouldn't keep working — a fresh code retires the old one.
  async function reset() {
    setResetting(true);
    setResetError(null);
    try {
      await onReset();
    } catch (err) {
      setResetError(err.message);
    } finally {
      setResetting(false);
    }
  }
  const link = inviteLink(code);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (permissions, insecure context) — the
      // link is right there in a selectable field either way.
    }
  }

  async function share() {
    try {
      await navigator.share({ title: `Join ${campaignName}`, text: `Join "${campaignName}" on Dungeon Buddy:`, url: link });
    } catch {
      // Dismissing the share sheet rejects — nothing to report.
    }
  }

  return (
    <Panel className="invite-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
        <h3 style={{ fontSize: '1rem' }}>Invite Players</h3>
        <button type="button" className="condition-chip-remove" style={{ color: 'var(--text-dim)' }} onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <p style={{ fontSize: '0.85rem', marginTop: '0.4rem' }}>
        Send this link to your players — they only need to pick a name. No account required.
      </p>
      <input
        className="invite-link"
        readOnly
        value={link}
        onFocus={(e) => e.currentTarget.select()}
        aria-label="Invite link"
      />
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary btn-small" onClick={copy}>
          {copied ? 'Copied!' : 'Copy Link'}
        </button>
        {canShare && (
          <button type="button" className="btn btn-ghost btn-small" onClick={share}>
            Share…
          </button>
        )}
      </div>
      <p className="hint-text" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
        Or they can enter the code <strong className="invite-code">{code}</strong> under “Join a Game”.
      </p>
      {onReset && (
        <div className="invite-reset">
          <ConfirmButton onConfirm={reset} className="example-toggle" confirmLabel="Tap again — the old link will stop working" disabled={resetting}>
            {resetting ? 'Resetting…' : 'Reset link'}
          </ConfirmButton>
          {resetError && <p className="error-text" style={{ marginTop: '0.4rem' }}>{resetError}</p>}
        </div>
      )}
    </Panel>
  );
}
