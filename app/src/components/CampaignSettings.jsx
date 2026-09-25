import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  deleteCampaign,
  deleteGuestCampaign,
  leaveCampaign,
  listCampaignMembers,
  removeMember,
  renameGuestCampaign,
  updateCampaign,
} from '../lib/campaigns.js';
import { useCampaignLive } from '../lib/live.js';
import { useSession } from '../lib/SessionContext.jsx';
import { ConfirmButton } from './ConfirmButton.jsx';
import { Panel } from './ornament/Panel.jsx';

// Everything about the campaign itself, as opposed to what's in it: its
// name, who's at the table, leaving, and deleting. Opened from the
// campaign title bar (CampaignScreen) — one place for all of it, rather
// than scattering rename/remove/delete controls across the tabs.
//
//   DM (account):  rename + description, see and remove players, delete.
//   Player:        see who's at the table, leave.
//   Offline:       rename (DM) and delete from this device.
export function CampaignSettings({ campaign, isDM, isGuest, onUpdated, onClose }) {
  const navigate = useNavigate();
  const { user } = useSession();

  const [name, setName] = useState(campaign.name);
  const [description, setDescription] = useState(campaign.description || '');
  const [saved, setSaved] = useState(false);
  const [members, setMembers] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [deleteText, setDeleteText] = useState('');

  const loadMembers = useCallback(
    () =>
      listCampaignMembers(campaign.id)
        .then(setMembers)
        .catch((err) => setError(`Couldn't load who's at the table — ${err.message}`)),
    [campaign.id],
  );

  useEffect(() => {
    if (!isGuest) loadMembers();
  }, [isGuest, loadMembers]);

  // Someone joining while this is open shows up without a reload.
  useCampaignLive(!isGuest, campaign.id, ['campaign_members'], loadMembers);

  async function run(action) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const dirty = name.trim() !== campaign.name || (!isGuest && description.trim() !== (campaign.description || ''));

  function save(event) {
    event.preventDefault();
    if (!name.trim() || !dirty) return;
    run(async () => {
      const next = isGuest
        ? renameGuestCampaign(campaign.id, name.trim())
        : await updateCampaign(campaign.id, { name: name.trim(), description: description.trim() });
      onUpdated({ ...campaign, ...next, role: campaign.role });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    });
  }

  function remove(member) {
    run(async () => {
      await removeMember(campaign.id, member.userId);
      setMembers((prev) => prev.filter((m) => m.userId !== member.userId));
    });
  }

  function leave() {
    run(async () => {
      await leaveCampaign(campaign.id);
      navigate('/dashboard', { replace: true });
    });
  }

  const deleteMatches = deleteText.trim().toLowerCase() === campaign.name.trim().toLowerCase();

  function destroy(event) {
    event.preventDefault();
    if (!deleteMatches) return;
    run(async () => {
      if (isGuest) deleteGuestCampaign(campaign.id);
      else await deleteCampaign(campaign.id);
      navigate('/dashboard', { replace: true });
    });
  }

  const canDelete = isDM || isGuest;

  return (
    <Panel className="settings-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
        <h3 style={{ fontSize: '1rem' }}>Campaign Settings</h3>
        <button type="button" className="condition-chip-remove" style={{ color: 'var(--text-dim)' }} onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      {error && <p className="error-text" style={{ marginTop: '0.75rem' }}>{error}</p>}

      {isDM && (
        <form onSubmit={save} className="settings-section">
          <div className="field">
            <label htmlFor="settingsName">Name</label>
            <input id="settingsName" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </div>
          {!isGuest && (
            <div className="field">
              <label htmlFor="settingsDescription">Description</label>
              <textarea
                id="settingsDescription"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder="A line or two for your players"
              />
            </div>
          )}
          <div>
            <button className="btn btn-primary btn-small" type="submit" disabled={busy || !name.trim() || !dirty}>
              {saved ? 'Saved!' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}

      {!isGuest && (
        <div className="settings-section">
          <h4 className="settings-heading">At the table</h4>
          {members === null && !error && <p className="hint-text">Loading…</p>}
          {members && (
            <ul className="member-list">
              {members.map((m) => (
                <li key={m.userId} className="member-row">
                  <span className="member-name">{m.displayName}</span>
                  <span className="chip chip-small">{m.role === 'dm' ? 'DM' : 'Player'}</span>
                  {m.userId === user?.id && <span className="chip chip-small">You</span>}
                  {isDM && m.role !== 'dm' && (
                    <ConfirmButton onConfirm={() => remove(m)} confirmLabel="Remove?" className="btn btn-ghost btn-small member-remove" disabled={busy}>
                      Remove
                    </ConfirmButton>
                  )}
                </li>
              ))}
            </ul>
          )}
          {isDM && members && members.length > 1 && (
            <p className="hint-text" style={{ marginBottom: 0 }}>
              A removed player's character stays in the campaign. To stop them rejoining, reset the invite link too.
            </p>
          )}
        </div>
      )}

      {!isDM && !isGuest && (
        <div className="settings-section">
          <p style={{ fontSize: '0.88rem' }}>
            Leaving takes the campaign off your list. Your character stays here — rejoin with the invite link and it's
            yours again.
          </p>
          <div>
            <ConfirmButton onConfirm={leave} className="btn btn-danger btn-small" confirmLabel="Tap again to leave" disabled={busy}>
              Leave Campaign
            </ConfirmButton>
          </div>
        </div>
      )}

      {canDelete && (
        <form onSubmit={destroy} className="settings-section settings-danger">
          <h4 className="settings-heading">{isGuest ? 'Delete from this device' : 'Delete campaign'}</h4>
          <p style={{ fontSize: '0.88rem' }}>
            {isGuest
              ? 'Removes this campaign and everything in it from this device. This can’t be undone.'
              : 'Deletes the campaign for everyone — characters, notes, lore, monsters, fights and rolls. This can’t be undone.'}
          </p>
          <div className="field">
            <label htmlFor="settingsDeleteConfirm">
              Type <strong>{campaign.name}</strong> to confirm
            </label>
            <input
              id="settingsDeleteConfirm"
              value={deleteText}
              onChange={(e) => setDeleteText(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>
          <div>
            <button className="btn btn-danger btn-small" type="submit" disabled={busy || !deleteMatches}>
              Delete Campaign
            </button>
          </div>
        </form>
      )}
    </Panel>
  );
}
