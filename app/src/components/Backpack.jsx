import { useState } from 'react';
import { PartyStash } from './PartyStash.jsx';
import { Portrait } from './Portrait.jsx';
import { NpcCard } from './Npc.jsx';
import { SheetInventory } from './SheetInventory.jsx';

// Everything about *your* character, behind one button on the scene: who
// you are (and the full sheet, one tap further), what you carry, and the
// party's shared stash.
export function Backpack({ character, conditions, status, campaignId, characterNames, onOpenSheet, onFindCharacter, findLabel, onPatch, met = [] }) {
  const [tab, setTab] = useState(character ? 'me' : 'stash');
  const pct = character?.maxHp ? Math.max(0, Math.min(100, ((character.currentHp ?? 0) / character.maxHp) * 100)) : null;
  const band = pct == null || pct > 50 ? 'ok' : pct > 25 ? 'warn' : 'danger';

  return (
    <div className="backpack">
      <div className="party-views" role="tablist" aria-label="Backpack">
        {character && (
          <>
            <button type="button" role="tab" aria-selected={tab === 'me'} className={tab === 'me' ? 'active' : ''} onClick={() => setTab('me')}>
              {character.name}
            </button>
            <button type="button" role="tab" aria-selected={tab === 'items'} className={tab === 'items' ? 'active' : ''} onClick={() => setTab('items')}>
              Carrying
            </button>
          </>
        )}
        <button type="button" role="tab" aria-selected={tab === 'stash'} className={tab === 'stash' ? 'active' : ''} onClick={() => setTab('stash')}>
          Stash
        </button>
        <button type="button" role="tab" aria-selected={tab === 'met'} className={tab === 'met' ? 'active' : ''} onClick={() => setTab('met')}>
          Met
        </button>
      </div>

      {!character && (
        <div className="backpack-empty">
          <p>You're at the table without a character.</p>
          <button type="button" className="btn btn-primary btn-small" onClick={onFindCharacter}>
            {findLabel}
          </button>
        </div>
      )}

      {character && tab === 'me' && (
        <div className="backpack-me">
          <Portrait path={character.portraitPath} name={character.name} size="lg" />
          <h3>{character.name}</h3>
          {(character.classAndLevel || character.race) && (
            <p className="party-card-sub">{[character.classAndLevel, character.race].filter(Boolean).join(' · ')}</p>
          )}
          {character.maxHp != null && (
            <div className="combat-hp backpack-hp">
              <div className="hp-track hp-track-slim">
                <div className={`hp-track-fill hp-track-fill-${band}`} style={{ width: `${pct}%` }} />
              </div>
              <span className="combat-hp-numbers">
                {character.currentHp ?? '—'}/{character.maxHp}
              </span>
              {character.armorClass != null && <span className="chip chip-small">AC {character.armorClass}</span>}
            </div>
          )}
          {conditions.length > 0 && (
            <div className="combat-conditions" style={{ justifyContent: 'center' }}>
              {conditions.map((c) => (
                <span key={c.id} className="condition-chip">
                  {c.label}
                </span>
              ))}
            </div>
          )}
          <button type="button" className="btn btn-primary" onClick={onOpenSheet}>
            Open Full Sheet
          </button>
          {findLabel && (
            <button type="button" className="btn btn-ghost btn-small" onClick={onFindCharacter}>
              {findLabel}
            </button>
          )}
        </div>
      )}

      {character && tab === 'items' && <SheetInventory sheet={character} editable onPatch={onPatch} />}

      {tab === 'stash' && <PartyStash status={status} campaignId={campaignId} characterNames={characterNames} />}

      {tab === 'met' &&
        (met.length === 0 ? (
          <p className="hint-text">Nobody yet — the people you meet on your travels gather here.</p>
        ) : (
          <ul className="npc-list">
            {[...met]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((n) => (
                <li key={n.id}>
                  <NpcCard npc={n} />
                </li>
              ))}
          </ul>
        ))}
    </div>
  );
}
