import { useState } from 'react';
import { DeleteButton } from './DeleteButton.jsx';
import { Panel } from './ornament/Panel.jsx';
import { abilityMod, hasRolled, healthDescriptor, rollInitiative, STANDARD_CONDITIONS } from '../lib/encounters.js';

// The combat controls a scene token opens (SceneScreen.jsx): initiative,
// HP, death saves and conditions for one combatant, plus the DM's form
// for bringing more into the fight. A PC's HP and conditions are read
// from and written to the character sheet itself, never the combatant
// row — see BIBLE.md §7.
export function CombatantRow({
  combatant,
  sheet,
  pcConditions,
  isCurrent,
  isDM,
  isMine,
  canEditInitiative,
  canEditHp,
  onHp,
  onInitiative,
  onRollInitiative,
  onRemove,
  onAddCondition,
  onRemoveCondition,
}) {
  const [delta, setDelta] = useState('');

  const hp = combatant.isPc ? sheet?.currentHp : combatant.currentHp;
  const maxHp = combatant.isPc ? sheet?.maxHp : combatant.maxHp;
  const ac = combatant.isPc ? sheet?.armorClass : combatant.armorClass;
  const pct = maxHp ? Math.max(0, Math.min(100, ((hp ?? 0) / maxHp) * 100)) : 0;
  const band = pct > 50 ? 'ok' : pct > 25 ? 'warn' : 'danger';
  // Exact numbers for the DM, for PCs (the party's HP is already visible
  // on their sheets), and for your own character; a monster's health
  // reads as a descriptor to players — "Bloodied," not "14/58."
  const showExact = isDM || combatant.isPc;
  const down = maxHp != null && (hp ?? 0) <= 0;

  const conditionItems = combatant.isPc
    ? (pcConditions || []).map((c) => ({ key: c.id, label: c.label, raw: c }))
    : (combatant.conditions || []).map((label) => ({ key: label, label, raw: { label } }));

  function applyDelta(sign) {
    onHp((Math.abs(Number(delta)) || 1) * sign);
    setDelta('');
  }

  // The initiative box is uncontrolled and keyed on the saved value, so a
  // change from elsewhere ("Roll NPC Initiative", or another device via
  // Realtime) remounts it with the new number instead of needing an
  // effect to copy props into state.
  function commitInitiative(input) {
    const value = Math.round(Number(input.value));
    if (input.value !== '' && Number.isFinite(value) && value !== combatant.initiative) onInitiative(value);
    else input.value = hasRolled(combatant) ? String(combatant.initiative) : '';
  }

  const deathSaves =
    combatant.isPc && down && sheet
      ? { successes: sheet.deathSaveSuccesses ?? 0, failures: sheet.deathSaveFailures ?? 0 }
      : null;
  const pcStatus = deathSaves
    ? deathSaves.failures >= 3
      ? 'Dead'
      : deathSaves.successes >= 3
        ? 'Stable'
        : 'Dying'
    : null;

  return (
    <div className={`panel combat-row${isCurrent ? ' current' : ''}${down && !combatant.isPc ? ' down' : ''}`}>
      {isDM && <DeleteButton onConfirm={onRemove} label={combatant.name} />}

      <div className="combat-row-main">
        {canEditInitiative ? (
          <div className={`initiative-edit${!hasRolled(combatant) && isMine ? ' needs-roll' : ''}`}>
            <input
              key={combatant.initiative ?? 'unrolled'}
              type="number"
              defaultValue={combatant.initiative ?? ''}
              placeholder="—"
              onBlur={(e) => commitInitiative(e.currentTarget)}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              aria-label={`Initiative for ${combatant.name}`}
              className="initiative-input"
            />
            <button type="button" className="initiative-roll" onClick={onRollInitiative} title="Roll d20 + DEX" aria-label={`Roll initiative for ${combatant.name}`}>
              d20
            </button>
          </div>
        ) : (
          <span className="initiative-badge" title="Initiative">
            {hasRolled(combatant) ? combatant.initiative : '—'}
          </span>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="combat-row-title">
            {isCurrent && <span className="combat-now" aria-label="Current turn">▶</span>}
            <span className="combat-name">{combatant.name}</span>
            {combatant.isPc ? <span className="chip chip-small">{isMine ? 'You' : 'PC'}</span> : null}
            {showExact && ac != null && <span className="chip chip-small">AC {ac}</span>}
            {pcStatus && <span className={`chip chip-small combat-status combat-status-${pcStatus.toLowerCase()}`}>{pcStatus}</span>}
            {down && !combatant.isPc && <span className="chip chip-small">Down</span>}
          </div>

          {maxHp != null && (
            <div className="combat-hp">
              {showExact ? (
                <>
                  <div className="hp-track hp-track-slim">
                    <div className={`hp-track-fill hp-track-fill-${band}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="combat-hp-numbers">
                    {hp ?? '—'}/{maxHp}
                  </span>
                </>
              ) : (
                <span className="combat-hp-descriptor">{healthDescriptor(hp, maxHp)}</span>
              )}
            </div>
          )}

          {deathSaves && (
            <div className="death-save-mini" aria-label={`Death saves: ${deathSaves.successes} successes, ${deathSaves.failures} failures`}>
              <Pips count={deathSaves.successes} kind="success" />
              <Pips count={deathSaves.failures} kind="failure" />
            </div>
          )}

          {(conditionItems.length > 0 || isDM) && (
            <div className="combat-conditions">
              {conditionItems.map((c) => (
                <span key={c.key} className="condition-chip">
                  {c.label}
                  {isDM && (
                    <button
                      type="button"
                      className="condition-chip-remove"
                      onClick={() => onRemoveCondition(c.raw)}
                      aria-label={`Remove ${c.label} from ${combatant.name}`}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
              {isDM && <ConditionPicker onPick={onAddCondition} existing={conditionItems.map((c) => c.label)} />}
            </div>
          )}

          {canEditHp && maxHp != null && (
            <div className="combat-hp-adjust">
              <input
                type="number"
                min="1"
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
                placeholder="1"
                className="hp-adjust-input"
                aria-label={`HP amount for ${combatant.name}`}
              />
              <button type="button" className="btn btn-danger btn-small" onClick={() => applyDelta(-1)}>
                Damage
              </button>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => applyDelta(1)}>
                Heal
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Pips({ count, kind }) {
  return (
    <span className={`pips pips-${kind}`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={`pip${i < count ? ' filled' : ''}`} />
      ))}
    </span>
  );
}

function ConditionPicker({ onPick, existing }) {
  const [custom, setCustom] = useState(null);

  if (custom !== null) {
    return (
      <form
        className="condition-custom"
        onSubmit={(e) => {
          e.preventDefault();
          if (custom.trim()) onPick(custom.trim().slice(0, 120));
          setCustom(null);
        }}
      >
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Hexed…"
          autoFocus
          aria-label="Custom condition"
          onBlur={() => !custom.trim() && setCustom(null)}
        />
      </form>
    );
  }

  return (
    <select
      className="condition-select"
      value=""
      aria-label="Add a condition"
      onChange={(e) => {
        const value = e.target.value;
        if (value === '__custom') setCustom('');
        else if (value) onPick(value);
      }}
    >
      <option value="">+ Condition</option>
      {STANDARD_CONDITIONS.filter((c) => !existing.includes(c)).map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
      <option value="__custom">Custom…</option>
    </select>
  );
}

const BLANK_ADD = { source: 'custom', name: '', count: '1', armorClass: '', maxHp: '', dexModifier: '0', initiative: '' };

export function AddCombatantForm({ creatures, availableSheets, onAdd }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(BLANK_ADD);
  const [busy, setBusy] = useState(false);

  const isPc = form.source.startsWith('pc:');

  function pickSource(source) {
    if (source.startsWith('creature:')) {
      const creature = creatures.find((c) => c.id === source.slice(9));
      setForm({
        ...form,
        source,
        name: creature?.name || '',
        armorClass: creature?.armorClass ?? '',
        maxHp: creature?.hitPoints ?? '',
        dexModifier: String(abilityMod(creature?.abilities?.dex)),
      });
    } else if (source.startsWith('pc:')) {
      const sheet = availableSheets.find((s) => s.id === source.slice(3));
      setForm({ ...BLANK_ADD, source, name: sheet?.name || '', dexModifier: String(abilityMod(sheet?.abilities?.dex)), count: '1' });
    } else {
      setForm({ ...BLANK_ADD, source });
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.name.trim()) return;
    const count = isPc ? 1 : Math.min(10, Math.max(1, Number(form.count) || 1));
    const dex = Number(form.dexModifier) || 0;
    const entries = Array.from({ length: count }, (_, i) => {
      const hp = form.maxHp === '' ? null : Number(form.maxHp);
      return {
        name: count > 1 ? `${form.name.trim()} ${i + 1}` : form.name.trim(),
        isPc,
        characterId: isPc ? form.source.slice(3) : null,
        dexModifier: dex,
        // Blank initiative means "roll it for me" — each copy of a
        // monster rolls separately, like it would at the table.
        initiative: form.initiative === '' ? rollInitiative(dex) : Number(form.initiative),
        ...(isPc ? {} : { armorClass: form.armorClass === '' ? null : Number(form.armorClass), maxHp: hp, currentHp: hp }),
      };
    });
    setBusy(true);
    await onAdd(entries);
    setBusy(false);
    setForm(BLANK_ADD);
    setOpen(false);
  }

  if (!open) {
    return (
      <button className="btn btn-ghost" type="button" onClick={() => setOpen(true)}>
        + Add Combatant
      </button>
    );
  }

  return (
    <Panel>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="field">
          <label htmlFor="addSource">From</label>
          <select id="addSource" value={form.source} onChange={(e) => pickSource(e.target.value)}>
            <option value="custom">Custom (type it in)</option>
            {creatures.length > 0 && (
              <optgroup label="Bestiary">
                {creatures.map((c) => (
                  <option key={c.id} value={`creature:${c.id}`}>
                    {c.name}
                    {c.challengeRating ? ` (CR ${c.challengeRating})` : ''}
                  </option>
                ))}
              </optgroup>
            )}
            {availableSheets.length > 0 && (
              <optgroup label="Party (not yet in this fight)">
                {availableSheets.map((s) => (
                  <option key={s.id} value={`pc:${s.id}`}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: '3 1 180px' }}>
            <label htmlFor="addName">Name</label>
            <input
              id="addName"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Cliffside Ghoul"
              maxLength={110}
              disabled={isPc}
              autoFocus
            />
          </div>
          {!isPc && (
            <div className="field" style={{ flex: '1 1 70px' }}>
              <label htmlFor="addCount">How many</label>
              <input
                id="addCount"
                type="number"
                min="1"
                max="10"
                value={form.count}
                onChange={(e) => setForm({ ...form, count: e.target.value })}
              />
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {!isPc && (
            <>
              <div className="field" style={{ flex: '1 1 70px' }}>
                <label htmlFor="addAC">AC</label>
                <input id="addAC" type="number" value={form.armorClass} onChange={(e) => setForm({ ...form, armorClass: e.target.value })} />
              </div>
              <div className="field" style={{ flex: '1 1 70px' }}>
                <label htmlFor="addHP">HP</label>
                <input id="addHP" type="number" min="0" value={form.maxHp} onChange={(e) => setForm({ ...form, maxHp: e.target.value })} />
              </div>
            </>
          )}
          <div className="field" style={{ flex: '1 1 70px' }}>
            <label htmlFor="addDex">DEX mod</label>
            <input id="addDex" type="number" value={form.dexModifier} onChange={(e) => setForm({ ...form, dexModifier: e.target.value })} />
          </div>
          <div className="field" style={{ flex: '1 1 90px' }}>
            <label htmlFor="addInit">Initiative</label>
            <input
              id="addInit"
              type="number"
              value={form.initiative}
              onChange={(e) => setForm({ ...form, initiative: e.target.value })}
              placeholder="roll"
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-primary" type="submit" disabled={busy || !form.name.trim()}>
            {busy ? 'Adding…' : 'Add to Fight'}
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => {
              setForm(BLANK_ADD);
              setOpen(false);
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </Panel>
  );
}
