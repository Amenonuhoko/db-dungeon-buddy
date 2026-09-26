import { abilityMod } from '../lib/encounters.js';
import { Portrait } from './Portrait.jsx';

// The DM's party at a glance: what gets asked for all session — AC, HP,
// passive Perception (10 + WIS; sheets don't track skill proficiency),
// speed, conditions, who's dying — for everyone at once. Tap a row to
// open their token.
export function PartyGlance({ party, conditionsByCharacter, onOpen }) {
  if (party.length === 0) return <p className="hint-text">No one's at the table yet.</p>;
  return (
    <ul className="glance">
      {party.map(({ key, sheet }) => {
        const pct = sheet.maxHp ? Math.max(0, Math.min(100, ((sheet.currentHp ?? 0) / sheet.maxHp) * 100)) : null;
        const band = pct == null || pct > 50 ? 'ok' : pct > 25 ? 'warn' : 'danger';
        const down = sheet.maxHp != null && (sheet.currentHp ?? 0) <= 0;
        const conditions = conditionsByCharacter[sheet.id] || [];
        const passive = 10 + abilityMod(sheet.abilities?.wis);
        return (
          <li key={key}>
            <button type="button" className={`glance-row${down ? ' down' : ''}`} onClick={() => onOpen(key)}>
              <Portrait path={sheet.portraitPath} name={sheet.name} size="sm" />
              <span className="glance-main">
                <span className="glance-name">
                  {sheet.name}
                  {down && <em className="glance-down">{(sheet.deathSaveFailures ?? 0) >= 3 ? 'Dead' : (sheet.deathSaveSuccesses ?? 0) >= 3 ? 'Stable' : 'Dying'}</em>}
                </span>
                {pct != null && (
                  <span className="combat-hp glance-hp">
                    <span className="hp-track hp-track-slim">
                      <span className={`hp-track-fill hp-track-fill-${band}`} style={{ width: `${pct}%`, display: 'block' }} />
                    </span>
                    <span className="combat-hp-numbers">
                      {sheet.currentHp ?? '—'}/{sheet.maxHp}
                    </span>
                  </span>
                )}
                {conditions.length > 0 && (
                  <span className="glance-conditions">
                    {conditions.map((c) => (
                      <span key={c.id} className="condition-chip">
                        {c.label}
                      </span>
                    ))}
                  </span>
                )}
              </span>
              <span className="glance-stats">
                <span title="Armor Class">
                  <small>AC</small>
                  {sheet.armorClass ?? '—'}
                </span>
                <span title="Passive Perception (10 + WIS)">
                  <small>PER</small>
                  {passive}
                </span>
                <span title="Speed">
                  <small>SPD</small>
                  {(sheet.speed || '—').replace(/\s*ft\.?/i, '')}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
