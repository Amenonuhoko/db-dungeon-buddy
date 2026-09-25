import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BackButton } from '../components/BackButton.jsx';
import { FlowingDivider } from '../components/ornament/FlowingDivider.jsx';
import { Panel } from '../components/ornament/Panel.jsx';
import { joinCampaignByCode } from '../lib/campaigns.js';
import { listSheets, wornByUser } from '../lib/characters.js';
import { useSession } from '../lib/SessionContext.jsx';
import { supabase } from '../lib/supabase.js';

// The landing page for a DM's invite link (/join?code=…, built by
// InvitePanel.jsx), and the "Join a Game" button on Home. Three cases:
//   - Signed out: pick a name, join. Behind the scenes that's an
//     anonymous Supabase sign-in — a real member with real RLS-backed
//     permissions, just no email/password (BIBLE.md §4).
//   - Already logged in: join with the account you have — no second
//     identity. (This screen used to bounce logged-in visitors to the
//     dashboard, which silently threw the invite code away.)
//   - In offline (guest) mode: same as signed out; offline campaigns stay
//     on the device.
export function JoinCampaignScreen() {
  const [params] = useSearchParams();
  const presetCode = (params.get('code') || '').trim();
  const { status, guest, user, joinAsPlayer } = useSession();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState(guest?.displayName || '');
  const [code, setCode] = useState(presetCode);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const signedIn = status === 'authenticated';
  const accountName = user?.user_metadata?.display_name || user?.email;
  const canJoin = code.trim().length > 0 && (signedIn || displayName.trim().length > 0);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canJoin) return;
    setBusy(true);
    setError(null);
    try {
      if (!signedIn) await joinAsPlayer(displayName.trim());
      const campaign = await joinCampaignByCode(code.trim());
      // A new player picks (or skips) a character before sitting down; a
      // DM opening their own link, or someone rejoining who's still
      // wearing their character, goes straight to the table.
      if (campaign.role === 'dm') {
        navigate(`/campaigns/${campaign.id}`);
        return;
      }
      const { data } = await supabase.auth.getSession();
      const sheets = await listSheets('authenticated', campaign.id).catch(() => []);
      const wearing = wornByUser(sheets, data.session?.user?.id);
      navigate(wearing ? `/campaigns/${campaign.id}` : `/campaigns/${campaign.id}/choose?welcome=1`);
    } catch (err) {
      // lib/session.js and lib/campaigns.js already turn every failure
      // into a message that says what actually went wrong — a bad code,
      // or joining-without-an-account not being enabled on the backend.
      // Don't flatten those back into "check the code": that sent players
      // to their DM for a new code that failed exactly the same way.
      setError(err.message || "Couldn't join that campaign — try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '1.5rem 1.5rem 9rem' }}>
      <form onSubmit={handleSubmit} className="screen-enter" style={{ width: 'min(440px, 100%)' }}>
        <BackButton to={signedIn || status === 'guest' ? '/dashboard' : '/'} />
        <h2 style={{ textAlign: 'center' }}>{presetCode ? "You're Invited" : 'Join a Game'}</h2>
        <p style={{ textAlign: 'center', marginTop: '0.5rem' }}>
          {signedIn
            ? `Joining as ${accountName}.`
            : presetCode
              ? 'Just tell the table what to call you.'
              : 'No account needed — just a name and the code your DM gave you.'}
        </p>
        <div style={{ margin: '1.25rem 0' }}>
          <FlowingDivider />
        </div>

        <Panel style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {!signedIn && (
            <div className="field">
              <label htmlFor="joinDisplayName">Your name at the table</label>
              <input
                id="joinDisplayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Adventurer name"
                maxLength={60}
                autoFocus
              />
            </div>
          )}

          {/* A code that came in on the link is already filled in and
              doesn't need to be looked at — only ask for one when there
              isn't one. */}
          {!presetCode && (
            <div className="field">
              <label htmlFor="joinInviteCode">Invite code</label>
              <input
                id="joinInviteCode"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. ember-wolf-417"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoFocus={signedIn}
              />
            </div>
          )}

          {status === 'guest' && (
            <p className="hint-text" style={{ marginBottom: 0 }}>
              Your offline campaigns stay on this device.
            </p>
          )}

          {error && <p className="error-text">{error}</p>}

          <button className="btn btn-primary" type="submit" disabled={busy || !canJoin}>
            {busy ? 'Joining…' : 'Join Campaign'}
          </button>
        </Panel>
      </form>
    </div>
  );
}
