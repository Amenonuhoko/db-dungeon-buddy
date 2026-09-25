import { hueFor, initials } from '../lib/avatar.js';
import { describeWhere } from '../lib/presence.js';

// "At the table" — everyone in the campaign, with who's here right now
// (a live dot and what they're doing: "on Combat", "on Mira's sheet")
// and who's away. The top of the Party page, so the first thing anyone
// sees is who else is playing. Tapping someone opens a whisper to them.
export function TablePresence({ members, online, ready, myId, onWhisper }) {
  // Merge the member list with presence: someone who joined a second ago
  // can be online before the member list has refetched.
  const byId = new Map((members || []).map((m) => [m.userId, { ...m }]));
  for (const [userId, meta] of Object.entries(online)) {
    if (!byId.has(userId)) byId.set(userId, { userId, displayName: meta.name, role: meta.role });
  }
  const people = [...byId.values()].sort((a, b) => {
    const rank = (p) => (p.userId === myId ? 0 : online[p.userId] ? 1 : 2);
    return rank(a) - rank(b) || (a.role === 'dm' ? -1 : b.role === 'dm' ? 1 : 0) || a.displayName.localeCompare(b.displayName);
  });
  const hereCount = people.filter((p) => online[p.userId]).length;

  return (
    <section className="table-presence" aria-label="Who's at the table">
      <div className="table-presence-head">
        <h3>At the table</h3>
        <span className="table-presence-count" aria-live="polite">
          {ready ? `${hereCount} here now` : 'Checking who’s here…'}
        </span>
      </div>
      <ul className="table-presence-list">
        {people.map((p) => {
          const meta = online[p.userId];
          const isMe = p.userId === myId;
          const name = meta?.name || p.displayName;
          const content = (
            <>
              <span className="presence-avatar" style={{ '--hue': hueFor(p.userId) }} aria-hidden="true">
                {initials(name)}
                <span className={`presence-dot${meta ? ' online' : ''}`} />
              </span>
              <span className="presence-text">
                <span className="presence-name">
                  {name}
                  {isMe && <span className="presence-tag">You</span>}
                  {p.role === 'dm' && <span className="presence-tag">DM</span>}
                </span>
                <span className="presence-where">{meta ? describeWhere(meta.where) : 'away'}</span>
              </span>
            </>
          );
          return (
            <li key={p.userId} className={`presence-person${meta ? ' is-here' : ''}`}>
              {isMe || !onWhisper ? (
                <div className="presence-card">{content}</div>
              ) : (
                <button type="button" className="presence-card" onClick={() => onWhisper(p.userId)} title={`Whisper to ${name}`}>
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

