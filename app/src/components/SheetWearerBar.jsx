import { useEffect, useState } from 'react';
import { listCampaignMembers } from '../lib/campaigns.js';
import { doffCharacter, donCharacter, setWearer } from '../lib/characters.js';
import { saveSheetToRoster } from '../lib/roster.js';
import { ConfirmButton } from './ConfirmButton.jsx';

// Who's playing this character, and slipping in and out of it (online
// campaigns only — db/migrations/009_characters.sql):
//
//   - the DM picks who plays it (or nobody — back to the open pool); the
//     fix for accidents, and for a guest who lost their login and came
//     back as someone new;
//   - the player wearing it can slip out (it stays here, intact, for
//     anyone to pick up) or save its progress to My Characters;
//   - anyone else can slip into it when nobody's wearing it.
export function SheetWearerBar({ campaignId, sheet, isDM, user, onChanged, onSlippedOut }) {
  const [members, setMembers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    listCampaignMembers(campaignId)
      .then(setMembers)
      .catch(() => {});
  }, [campaignId]);

  const isAnonymous = Boolean(user?.is_anonymous);
  const mine = sheet.playerId && sheet.playerId === user?.id;
  const wearerName = members.find((m) => m.userId === sheet.playerId)?.displayName;

  async function run(action, done) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await action();
      done?.(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wearer-bar">
      {isDM ? (
        <div className="field wearer-field">
          <label htmlFor="wearerSelect">Played by</label>
          <select
            id="wearerSelect"
            value={sheet.playerId || ''}
            disabled={busy}
            onChange={(e) => run(() => setWearer('authenticated', campaignId, sheet.id, e.target.value || null), onChanged)}
          >
            <option value="">Nobody — anyone can slip in</option>
            {members
              .filter((m) => m.role === 'player' || m.userId === sheet.playerId)
              .map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.displayName}
                </option>
              ))}
          </select>
        </div>
      ) : mine ? (
        <p className="wearer-text">You're playing this character.</p>
      ) : sheet.playerId ? (
        <p className="wearer-text">Played by {wearerName || 'another player'}.</p>
      ) : (
        <p className="wearer-text">Nobody's playing this character right now.</p>
      )}

      <div className="wearer-actions">
        {!isDM && !sheet.playerId && (
          <button type="button" className="btn btn-primary btn-small" disabled={busy} onClick={() => run(() => donCharacter(sheet.id), onChanged)}>
            Slip Into This Character
          </button>
        )}
        {mine && !isAnonymous && (
          <button
            type="button"
            className="btn btn-ghost btn-small"
            disabled={busy}
            onClick={() =>
              run(
                () => saveSheetToRoster(campaignId, sheet),
                ({ created }) => {
                  setNotice(created ? 'Added to My Characters.' : 'My Characters updated.');
                  onChanged?.();
                },
              )
            }
          >
            Save to My Characters
          </button>
        )}
        {mine && (
          <ConfirmButton
            className="btn btn-ghost btn-small"
            confirmLabel="Tap again to slip out"
            disabled={busy}
            onConfirm={() => run(() => doffCharacter(campaignId), onSlippedOut)}
          >
            Slip Out
          </ConfirmButton>
        )}
      </div>
      {notice && <p className="notice-text">{notice}</p>}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
