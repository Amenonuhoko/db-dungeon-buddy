import { useState } from 'react';
import { ConfirmButton } from './ConfirmButton.jsx';

// What's happened, newest first: lines the app writes itself ("Goblin 2
// enters the fray", "Round 3"), lines the DM writes ("Mira casts Lay on
// Hands"), and the table's dice rolls, woven into one timeline. Lines
// from an earlier scene carry its name, so scrolling back reads like a
// session recap. Only the DM writes here or clears it.
export function SceneLog({ events, rolls, scenesById, currentSceneId, isDM, onPost, onClear }) {
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);

  const items = [
    ...events.map((e) => ({ ...e, type: 'event' })),
    ...rolls.map((r) => ({ ...r, type: 'roll' })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  async function post(event) {
    event.preventDefault();
    if (!draft.trim() || posting) return;
    setPosting(true);
    const ok = await onPost(draft.trim());
    setPosting(false);
    if (ok) setDraft('');
  }

  return (
    <div className="scene-log">
      {isDM && (
        <form className="scene-log-form" onSubmit={post}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="What happens? “The paladin casts Lay on Hands”"
            maxLength={500}
            aria-label="Add a line to the log"
          />
          <button className="btn btn-primary btn-small" type="submit" disabled={!draft.trim() || posting}>
            Post
          </button>
        </form>
      )}

      {items.length === 0 ? (
        <p className="hint-text" style={{ marginTop: '0.75rem' }}>
          {isDM
            ? 'Nothing yet. Tokens entering the fight, wounds, conditions and new rounds are written here as they happen — add your own lines above.'
            : 'Nothing has happened yet. Everything the DM narrates and every roll at the table lands here.'}
        </p>
      ) : (
        <ol className="scene-log-list">
          {items.map((item) => {
            if (item.type === 'roll') {
              const single = Array.isArray(item.rolls) && item.rolls.length === 1 && /^1d20\b/.test(item.expression);
              const flavour = single && item.rolls[0] === 20 ? ' roll-crit' : single && item.rolls[0] === 1 ? ' roll-fumble' : '';
              return (
                <li key={`roll-${item.id}`} className={`scene-log-item scene-log-roll${flavour}`}>
                  <span className="scene-log-glyph" aria-hidden="true">
                    ⚄
                  </span>
                  <span>
                    <strong>{item.displayName}</strong> rolled {item.expression}: <strong>{item.total}</strong>
                  </span>
                </li>
              );
            }
            const elsewhere = item.sceneId && item.sceneId !== currentSceneId ? scenesById[item.sceneId]?.name : null;
            return (
              <li key={item.id} className={`scene-log-item scene-log-${item.kind}`}>
                <span className="scene-log-glyph" aria-hidden="true">
                  {item.kind === 'manual' ? '❧' : '•'}
                </span>
                <span>
                  {item.text}
                  {elsewhere && <span className="scene-log-where"> · {elsewhere}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {isDM && items.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
          <ConfirmButton className="btn btn-ghost btn-small" confirmLabel="Tap again to clear" onConfirm={onClear}>
            Clear Log
          </ConfirmButton>
        </div>
      )}
    </div>
  );
}
