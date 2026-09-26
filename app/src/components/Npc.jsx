import { useState } from 'react';
import { ConfirmButton } from './ConfirmButton.jsx';
import { ARCHETYPES, archetypeOf, ATTITUDES, randomName } from '../lib/npcs.js';

// NPCs on screen: an emblem portrait per archetype (a mug for the
// innkeeper, a crown for the noble), the card players see when they tap
// one, and the DM's NPC tab — standard fare in one tap, somebody in
// particular when the story needs it.

const GLYPHS = {
  commoner: <path d="M12 12 a4 4 0 1 0 0-8 a4 4 0 1 0 0 8 Z M5 20 c1-4 4-6 7-6 s6 2 7 6" />,
  innkeeper: <path d="M6 7 h9 v11 a2 2 0 0 1 -2 2 h-5 a2 2 0 0 1 -2 -2 Z M15 10 h2 a2 2 0 0 1 2 2 v2 a2 2 0 0 1 -2 2 h-2 M6 7 c0-2 2-3 4.5-3 s4.5 1 4.5 3" />,
  merchant: <path d="M12 3 v17 M5 7 h14 M5 7 l-2.5 6 a2.5 2.5 0 0 0 5 0 Z M19 7 l-2.5 6 a2.5 2.5 0 0 0 5 0 Z M8 20 h8" />,
  blacksmith: <path d="M4 15 h11 l2 -3 h3 v2 h-2 l-1 2 v1 h-3 v3 h-6 v-3 h-4 Z M9 4 l5 5 M7 6 l4-4 3 3 -4 4 Z" />,
  farmer: <path d="M12 21 V5 M12 8 c-3-1-4-3-4-5 c3 0 4 2 4 5 Z M12 8 c3-1 4-3 4-5 c-3 0-4 2-4 5 Z M12 13 c-3-1-4-3-4-5 c3 0 4 2 4 5 Z M12 13 c3-1 4-3 4-5 c-3 0-4 2-4 5 Z" />,
  guard: <path d="M12 3 l7 3 v5 c0 5-3 8-7 10 c-4-2-7-5-7-10 V6 Z M12 7 v10 M8 11 h8" />,
  captain: <path d="M5 13 a7 7 0 0 1 14 0 v4 h-4 v-3 h-6 v3 H5 Z M12 6 V3 M9 14 v3 M15 14 v3" />,
  noble: <path d="M4 17 L3 7 l5 4 l4-6 l4 6 l5-4 l-1 10 Z M4 20 h16" />,
  priest: <path d="M12 8 a4 4 0 1 1 0 8 a4 4 0 1 1 0-8 Z M12 2 v3 M12 19 v3 M2 12 h3 M19 12 h3 M5 5 l2 2 M17 17 l2 2 M19 5 l-2 2 M7 17 l-2 2" />,
  sage: <path d="M3 6 c3-1 6-1 9 1 c3-2 6-2 9-1 v12 c-3-1-6-1-9 1 c-3-2-6-2-9-1 Z M12 7 v12" />,
  mage: <path d="M12 3 l2.5 6 l6.5 .5 l-5 4.2 l1.6 6.3 L12 16.6 L6.4 20 L8 13.7 L3 9.5 L9.5 9 Z" />,
  scout: <path d="M6 3 c6 3 6 15 0 18 M6 3 v18 M4 12 h15 l-3-2 M19 12 l-3 2" />,
  spy: <path d="M2 12 c3-5 7-7 10-7 s7 2 10 7 c-3 5-7 7-10 7 s-7-2-10-7 Z M12 9 a3 3 0 1 1 0 6 a3 3 0 1 1 0-6 Z" />,
  knight: <path d="M12 2 v14 M9 5 l3-3 l3 3 M7 16 h10 M12 16 v5 M10 21 h4" />,
  bandit: <path d="M3 9 c3-2 15-2 18 0 c0 3-1 5-3 5 c-2 0-3-2-6-2 s-4 2-6 2 c-2 0-3-2-3-5 Z M8 10.5 h1 M15 10.5 h1" />,
  thug: <path d="M6 10 v-2 a2 2 0 0 1 4 0 v1 a2 2 0 0 1 4 0 v1 a2 2 0 0 1 4 0 v4 c0 4-3 6-6 6 h-1 c-3 0-6-2-6-5 v-3 a2 2 0 0 1 4 0" />,
  cultist: <path d="M12 3 c-5 0-8 5-8 10 v8 h16 v-8 c0-5-3-10-8-10 Z M9 12 c1-1.5 5-1.5 6 0 c-1 3-5 3-6 0 Z" />,
};

export function NpcEmblem({ archetype, size = 'sm' }) {
  const a = archetypeOf(archetype);
  return (
    <span className={`portrait portrait-${size} npc-emblem`} style={{ '--npc-hue': a.hue }} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {GLYPHS[a.id] || GLYPHS.commoner}
      </svg>
    </span>
  );
}

// What anyone sees of an NPC: who they look like and how they seem to
// feel about the party.
export function NpcCard({ npc }) {
  return (
    <div className="npc-card">
      <NpcEmblem archetype={npc.archetype} size="md" />
      <div className="npc-card-text">
        <strong>{npc.name}</strong>
        <span className="npc-card-role">{archetypeOf(npc.archetype).name}</span>
        {npc.look && <span className="npc-card-look">{npc.look}</span>}
      </div>
      <span className={`npc-attitude npc-attitude-${npc.attitude}`}>{ATTITUDES.find((t) => t.id === npc.attitude)?.name}</span>
    </div>
  );
}

// The DM's NPC tab. `onPlace(npcOrArchetype)` puts someone on the scene.
export function NpcPanel({ npcs, creatures, hasScene, onQuickPlace, onPlace, onSave, onRemove }) {
  const [editing, setEditing] = useState(null); // null | 'new' | npc
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = npcs
    .filter((n) => !q || `${n.name} ${n.look || ''} ${archetypeOf(n.archetype).name}`.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (editing) {
    return (
      <NpcEditor
        npc={editing === 'new' ? null : editing}
        creatures={creatures}
        onCancel={() => setEditing(null)}
        onSave={async (fields, place) => {
          const saved = await onSave(editing === 'new' ? null : editing, fields);
          if (saved) {
            setEditing(null);
            if (place && hasScene) onPlace(saved);
          }
        }}
        onRemove={
          editing !== 'new'
            ? () => {
                onRemove(editing);
                setEditing(null);
              }
            : null
        }
        canPlace={hasScene}
      />
    );
  }

  return (
    <div className="npc-panel">
      <section>
        <h4>Standard fare — tap to place</h4>
        {!hasScene && <p className="hint-text" style={{ margin: 0 }}>Set a scene first.</p>}
        <div className="npc-archetypes">
          {ARCHETYPES.map((a) => (
            <button key={a.id} type="button" className="npc-archetype" disabled={!hasScene} onClick={() => onQuickPlace(a)}>
              <NpcEmblem archetype={a.id} />
              <span>{a.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="npc-panel-head">
          <h4>The cast</h4>
          <button type="button" className="btn btn-primary btn-small" onClick={() => setEditing('new')}>
            + New NPC
          </button>
        </div>
        {npcs.length > 4 && <input className="lookup-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find an NPC…" aria-label="Find an NPC" />}
        {npcs.length === 0 ? (
          <p className="hint-text" style={{ margin: 0 }}>
            Named NPCs you make live here, ready for any scene. A quick-placed guard can become one too — tap it on the scene.
          </p>
        ) : (
          <ul className="npc-list">
            {shown.map((n) => (
              <li key={n.id}>
                <NpcCard npc={n} />
                <div className="npc-list-actions">
                  {hasScene && (
                    <button type="button" className="btn btn-ghost btn-small" onClick={() => onPlace(n)}>
                      Place
                    </button>
                  )}
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => setEditing(n)}>
                    Edit
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function NpcEditor({ npc, creatures, onSave, onCancel, onRemove, canPlace }) {
  const [form, setForm] = useState(() => ({
    name: npc?.name || '',
    archetype: npc?.archetype || 'commoner',
    look: npc?.look || '',
    attitude: npc?.attitude || 'neutral',
    creatureId: npc?.creatureId || '',
    met: npc?.met ?? false,
  }));
  const [busy, setBusy] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function save(place) {
    if (!form.name.trim() || busy) return;
    setBusy(true);
    const a = archetypeOf(form.archetype);
    const archetypeChanged = !npc || npc.archetype !== form.archetype;
    await onSave(
      {
        name: form.name.trim().slice(0, 120),
        archetype: form.archetype,
        look: form.look.trim().slice(0, 300) || null,
        attitude: form.attitude,
        creatureId: form.creatureId || null,
        met: form.met,
        // A new archetype brings its stats; otherwise keep what's there.
        ...(archetypeChanged ? { armorClass: a.ac, maxHp: a.hp, dexMod: a.dex } : {}),
      },
      place,
    );
    setBusy(false);
  }

  return (
    <form
      className="npc-editor"
      onSubmit={(e) => {
        e.preventDefault();
        save(false);
      }}
    >
      <div className="field">
        <label htmlFor="npcName">Name</label>
        <div className="npc-name-row">
          <input id="npcName" value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={120} placeholder="Bram Tallow" autoFocus />
          <button type="button" className="btn btn-ghost btn-small" onClick={() => set({ name: randomName() })}>
            Suggest a Name
          </button>
        </div>
      </div>
      <div className="field">
        <label>What they are</label>
        <div className="npc-archetypes">
          {ARCHETYPES.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`npc-archetype${form.archetype === a.id ? ' active' : ''}`}
              onClick={() => set({ archetype: a.id })}
              aria-pressed={form.archetype === a.id}
            >
              <NpcEmblem archetype={a.id} />
              <span>{a.name}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor="npcLook">What the party sees</label>
        <input id="npcLook" value={form.look} onChange={(e) => set({ look: e.target.value })} maxLength={300} placeholder="A scarred dwarf in a leather apron" />
      </div>
      <div className="field">
        <label>Attitude towards the party</label>
        <div className="preset-grid">
          {ATTITUDES.map((t) => (
            <button key={t.id} type="button" className={`preset-chip npc-attitude-chip-${t.id}${form.attitude === t.id ? ' active' : ''}`} onClick={() => set({ attitude: t.id })}>
              {t.name}
            </button>
          ))}
        </div>
      </div>
      {creatures.length > 0 && (
        <div className="field">
          <label htmlFor="npcCreature">Full stat block (optional)</label>
          <select id="npcCreature" value={form.creatureId} onChange={(e) => set({ creatureId: e.target.value })}>
            <option value="">{archetypeOf(form.archetype).name} stats (AC {archetypeOf(form.archetype).ac}, HP {archetypeOf(form.archetype).hp})</option>
            {creatures.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.challengeRating ? ` (CR ${c.challengeRating})` : ''}
              </option>
            ))}
          </select>
        </div>
      )}
      <label className="lookup-check">
        <input type="checkbox" checked={form.met} onChange={(e) => set({ met: e.target.checked })} />
        The party has met them (they appear in the players’ “Who we’ve met”)
      </label>
      <div className="scene-token-actions" style={{ justifyContent: 'flex-start' }}>
        <button type="submit" className="btn btn-primary btn-small" disabled={!form.name.trim() || busy}>
          Save
        </button>
        {canPlace && (
          <button type="button" className="btn btn-ghost btn-small" disabled={!form.name.trim() || busy} onClick={() => save(true)}>
            Save & Place
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-small" onClick={onCancel}>
          Cancel
        </button>
        {onRemove && (
          <ConfirmButton className="btn btn-ghost btn-small" confirmLabel="Tap again to delete" onConfirm={onRemove}>
            Delete NPC
          </ConfirmButton>
        )}
      </div>
    </form>
  );
}
