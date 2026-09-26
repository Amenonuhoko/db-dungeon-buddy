import { abilityMod } from '../lib/encounters.js';

// A Bestiary creature's stat block, compact — for Look up and for a
// monster's token in the middle of a fight.
export function StatBlock({ creature }) {
  const c = creature;
  return (
    <div className="stat-block">
      <p className="lookup-stats">
        {c.armorClass != null && <span className="chip chip-small">AC {c.armorClass}</span>}
        {c.hitPoints != null && (
          <span className="chip chip-small">
            HP {c.hitPoints}
            {c.hitDice ? ` (${c.hitDice})` : ''}
          </span>
        )}
        {c.speed && <span className="chip chip-small">{c.speed}</span>}
        {c.challengeRating && <span className="chip chip-small">CR {c.challengeRating}</span>}
      </p>
      {c.abilities && (
        <div className="lookup-abilities">
          {['str', 'dex', 'con', 'int', 'wis', 'cha'].map((k) => {
            const mod = abilityMod(c.abilities[k]);
            return (
              <span key={k}>
                <small>{k.toUpperCase()}</small>
                {c.abilities[k] ?? 10} ({mod >= 0 ? '+' : ''}
                {mod})
              </span>
            );
          })}
        </div>
      )}
      {c.traits && <Section label="Traits" text={c.traits} />}
      {c.actions && <Section label="Actions" text={c.actions} />}
      {c.notes && <Section label="Notes" text={c.notes} />}
    </div>
  );
}

function Section({ label, text }) {
  return (
    <div>
      <p className="lookup-label">{label}</p>
      <div className="lookup-text">{text}</div>
    </div>
  );
}
