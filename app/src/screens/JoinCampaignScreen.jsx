import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FlowingDivider } from '../components/ornament/FlowingDivider.jsx';
import { Panel } from '../components/ornament/Panel.jsx';
import { joinCampaignByCode } from '../lib/campaigns.js';
import { useSession } from '../lib/SessionContext.jsx';

// The zero-friction path onto someone else's real campaign — no email,
// no password. Behind the scenes this is a genuine Supabase Auth session
// (anonymous sign-in), so it's a real member with real RLS-backed
// permissions once it lands, not a local-only guest. See BIBLE.md §4.
export function JoinCampaignScreen() {
  const [displayName, setDisplayName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const { status, joinAsPlayer } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === 'guest' || status === 'authenticated') {
      navigate('/dashboard', { replace: true });
    }
  }, [status, navigate]);

  const canJoin = displayName.trim().length > 0 && code.trim().length > 0;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canJoin) return;
    setBusy(true);
    setError(null);
    try {
      await joinAsPlayer(displayName.trim());
      const campaign = await joinCampaignByCode(code.trim());
      navigate(`/campaigns/${campaign.id}`);
    } catch (err) {
      setError(err.message || 'Could not join that campaign.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '1.5rem' }}>
      <form onSubmit={handleSubmit} className="screen-enter" style={{ width: 'min(440px, 100%)' }}>
        <h2 style={{ textAlign: 'center' }}>Join a Campaign</h2>
        <p style={{ textAlign: 'center', marginTop: '0.5rem' }}>
          No account needed — just a name and the code your DM gave you.
        </p>
        <div style={{ margin: '1.25rem 0' }}>
          <FlowingDivider />
        </div>

        <Panel style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="field">
            <label htmlFor="joinDisplayName">What should we call you?</label>
            <input
              id="joinDisplayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Adventurer name"
              autoFocus
            />
          </div>

          <div className="field">
            <label htmlFor="joinInviteCode">Invite Code</label>
            <input
              id="joinInviteCode"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="from your DM"
            />
          </div>

          {error && <p className="error-text">{error}</p>}

          <button className="btn btn-primary" type="submit" disabled={busy || !canJoin}>
            {busy ? 'Joining…' : 'Join Campaign'}
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => navigate('/')}>
            Back
          </button>
        </Panel>
      </form>
    </div>
  );
}
