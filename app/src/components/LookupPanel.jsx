import { useState } from 'react';
import { StatBlock } from './StatBlock.jsx';

// The DM's Look up sheet: one search across Lore, Monsters and Notes,
// read right over the scene. From an entry: hand Lore (or a note) out to
// the table, or drop a monster straight into the fight.
const KINDS = [
  { id: 'all', label: 'All' },
  { id: 'lore', label: 'Lore' },
  { id: 'monster', label: 'Monsters' },
  { id: 'note', label: 'Notes' },
];

export function LookupPanel({ lore, creatures, notes, fightOn, onHandout, onAddToFight, onPlace, onOpenTab }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [open, setOpen] = useState(null);
  const [count, setCount] = useState(1);
  const [hidden, setHidden] = useState(true);

  const items = [
    ...lore.map((e) => ({ kind: 'lore', id: e.id, title: e.title, sub: e.category, text: e.body, entry: e })),
    ...creatures.map((c) => ({
      kind: 'monster',
      id: c.id,
      title: c.name,
      sub: c.challengeRating ? `CR ${c.challengeRating}` : 'monster',
      text: `${c.traits || ''} ${c.actions || ''} ${c.notes || ''}`,
      entry: c,
    })),
    ...notes.map((n) => ({ kind: 'note', id: n.id, title: n.title || 'Untitled note', sub: 'note', text: n.body, entry: n })),
  ];
  const q = query.trim().toLowerCase();
  const found = items
    .filter((i) => kind === 'all' || i.kind === kind)
    .filter((i) => !q || `${i.title} ${i.text || ''}`.toLowerCase().includes(q))
    .sort((a, b) => Number(b.title.toLowerCase().includes(q)) - Number(a.title.toLowerCase().includes(q)) || a.title.localeCompare(b.title))
    .slice(0, 40);

  if (open) {
    const e = open.entry;
    return (
      <div className="lookup-detail">
        <button type="button" className="btn btn-ghost btn-small" onClick={() => setOpen(null)} style={{ alignSelf: 'flex-start' }}>
          ← Results
        </button>
        <h3>{open.title}</h3>
        {open.kind === 'monster' ? (
          <>
            <StatBlock creature={e} />
            <div className="lookup-actions">
              <label htmlFor="lookupCount">How many</label>
              <input id="lookupCount" type="number" min="1" max="10" value={count} onChange={(ev) => setCount(Math.min(10, Math.max(1, Number(ev.target.value) || 1)))} />
              {fightOn && (
                <button type="button" className="btn btn-primary btn-small" onClick={() => onAddToFight(e, count)}>
                  Add to the Fight
                </button>
              )}
            </div>
            {onPlace && (
              <div className="lookup-actions">
                <label className="lookup-check">
                  <input type="checkbox" checked={hidden} onChange={(ev) => setHidden(ev.target.checked)} />
                  Hidden until I reveal them
                </label>
                <button type="button" className={`btn btn-small ${fightOn ? 'btn-ghost' : 'btn-primary'}`} onClick={() => onPlace(e, count, hidden)}>
                  Place on the Scene
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            {open.kind === 'lore' && <p className="hint-text lookup-kind">{e.category}</p>}
            <div className="lookup-text">{open.text}</div>
            <div className="lookup-actions">
              <button type="button" className="btn btn-primary btn-small" onClick={() => onHandout({ text: open.title, body: open.text || '' })}>
                Show as a Handout
              </button>
            </div>
          </>
        )}
        <button type="button" className="btn btn-ghost btn-small" style={{ alignSelf: 'flex-start' }} onClick={() => onOpenTab(open.kind === 'lore' ? 'encyclopedia' : open.kind === 'monster' ? 'bestiary' : 'notes')}>
          Open in {open.kind === 'lore' ? 'Lore' : open.kind === 'monster' ? 'Monsters' : 'Notes'} →
        </button>
      </div>
    );
  }

  return (
    <div className="lookup">
      <input className="lookup-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Goblin, the Rusty Flagon, the vault key…" aria-label="Search" autoFocus />
      <div className="preset-grid">
        {KINDS.map((k) => (
          <button key={k.id} type="button" className={`preset-chip${kind === k.id ? ' active' : ''}`} onClick={() => setKind(k.id)}>
            {k.label}
          </button>
        ))}
      </div>
      {found.length === 0 ? (
        <p className="hint-text">{items.length === 0 ? 'Nothing written yet — add Lore, Monsters and Notes from the menu.' : 'Nothing matches that.'}</p>
      ) : (
        <ul className="lookup-results">
          {found.map((i) => (
            <li key={`${i.kind}-${i.id}`}>
              <button
                type="button"
                onClick={() => {
                  setOpen(i);
                  setCount(1);
                }}
              >
                <strong>{i.title}</strong>
                <span>{i.sub}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
