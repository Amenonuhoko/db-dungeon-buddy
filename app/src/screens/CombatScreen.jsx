import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { DeleteButton } from '../components/DeleteButton.jsx';
import { Panel } from '../components/ornament/Panel.jsx';
import { listCreatures } from '../lib/bestiary.js';
import {
  addCondition,
  hpPatch,
  listConditions,
  listSheets,
  LOCAL_PLAYER_ID,
  removeCondition,
  updateSheet,
} from '../lib/characters.js';
import { clearRolls, listRolls } from '../lib/diceLog.js';
import {
  abilityMod,
  addCombatant,
  combatantHpPatch,
  createEncounter,
  hasRolled,
  healthDescriptor,
  listCombatants,
  listEncounters,
  removeCombatant,
  rollInitiative,
  setOwnInitiative,
  sortCombatants,
  STANDARD_CONDITIONS,
  stepTurn,
  subscribeToCampaignLive,
  updateCombatant,
  updateEncounter,
} from '../lib/encounters.js';
import { useSession } from '../lib/SessionContext.jsx';

// The live initiative tracker — Phase 4 (BIBLE.md §7/§8). The DM runs it
// (start an encounter, add monsters, set initiative, advance turns); every
// player in the campaign sees the same turn order update live on their
// own device (account mode, via Supabase Realtime), and can adjust their
// own character's HP from here. A PC's HP and conditions are read from and
// written to the character sheet itself, never duplicated onto the
// combatant row — so the sheet and this screen can't disagree.

function missingMigration(err) {
  const msg = err?.message || '';
  return err?.code === 'PGRST205' || err?.code === '42P01' || /schema cache|does not exist/i.test(msg);
}

function describeLoadError(err) {
  if (missingMigration(err)) {
    return 'The combat tracker needs db/migrations/005_live_play.sql run in your Supabase SQL editor first (see README.md → Database setup).';
  }
  return err?.message || 'Something went wrong loading the encounter.';
}

export function CombatScreen() {
  const { campaignId, isDM, isGuest } = useOutletContext();
  const { status, user } = useSession();

  const [encounters, setEncounters] = useState([]);
  const [combatants, setCombatants] = useState([]);
  const [sheets, setSheets] = useState([]);
  const [conditions, setConditions] = useState([]);
  const [creatures, setCreatures] = useState([]);
  const [rolls, setRolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newName, setNewName] = useState('');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [busy, setBusy] = useState(false);

  const shareRolls = status === 'authenticated';

  const refresh = useCallback(async () => {
    const [enc, comb, sh, cond, bestiary, log] = await Promise.all([
      listEncounters(status, campaignId),
      listCombatants(status, campaignId),
      listSheets(status, campaignId),
      listConditions(status, campaignId),
      isDM ? listCreatures(status, campaignId).catch(() => []) : Promise.resolve([]),
      shareRolls ? listRolls(campaignId).catch(() => []) : Promise.resolve([]),
    ]);
    setEncounters(enc);
    setCombatants(comb);
    setSheets(sh);
    setConditions(cond);
    setCreatures(bestiary);
    setRolls(log);
  }, [status, campaignId, isDM, shareRolls]);

  useEffect(() => {
    setLoading(true);
    refresh()
      .then(() => setError(null))
      .catch((err) => setError(describeLoadError(err)))
      .finally(() => setLoading(false));
  }, [refresh]);

  // Live updates (account mode only). A tab that was backgrounded on a
  // phone can miss Realtime events while suspended, so coming back to it
  // also refetches — cheap insurance against a stale turn order.
  useEffect(() => {
    if (status !== 'authenticated') return undefined;
    const quietRefresh = () => refresh().catch(() => {});
    const unsubscribe = subscribeToCampaignLive(campaignId, quietRefresh);
    const onVisible = () => {
      if (document.visibilityState === 'visible') quietRefresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [status, campaignId, refresh]);

  useEffect(() => {
    if (!confirmEnd) return undefined;
    const t = window.setTimeout(() => setConfirmEnd(false), 3000);
    return () => window.clearTimeout(t);
  }, [confirmEnd]);

  // Every write goes through here: surface the error, then refetch so the
  // screen reflects what the database actually holds (in account mode the
  // Realtime echo would get there too — this just doesn't wait for it).
  async function act(fn) {
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      const msg = err?.message || '';
      setError(
        err?.code === 'PGRST202' || /set_my_initiative/.test(msg) || /null value in column "initiative"/.test(msg)
          ? 'Players rolling their own initiative needs db/migrations/006_player_initiative.sql run in Supabase first.'
          : msg || 'Something went wrong.',
      );
    }
  }

  const encounter = encounters.find((e) => e.active) || null;
  const ordered = encounter ? sortCombatants(combatants.filter((c) => c.encounterId === encounter.id)) : [];
  const current = ordered.find((c) => c.id === encounter?.currentCombatantId) || null;
  const sheetsById = Object.fromEntries(sheets.map((s) => [s.id, s]));
  const conditionsByCharacter = conditions.reduce((acc, c) => {
    (acc[c.characterId] ||= []).push(c);
    return acc;
  }, {});

  function ownsSheet(sheet) {
    if (!sheet) return false;
    if (isGuest) return sheet.playerId === LOCAL_PLAYER_ID;
    return sheet.playerId === user?.id;
  }

  // "You" / "It's your turn!" are for a player looking at their own
  // character — never the DM, who in guest mode technically "owns" every
  // local sheet on the device and would otherwise be told it's their turn
  // every time a PC is up.
  const isMyCharacter = (sheet) => !isDM && ownsSheet(sheet);
  const myTurn = current?.isPc && isMyCharacter(sheetsById[current.characterId]);
  const myUnrolled = ordered.some((c) => c.isPc && !hasRolled(c) && isMyCharacter(sheetsById[c.characterId]));

  // Keep whoever's up on screen when the turn moves — a long initiative
  // list shouldn't need scrolling to find the glowing row.
  const currentId = current?.id;
  useEffect(() => {
    if (!currentId) return;
    document.querySelector('.combat-row.current')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentId]);

  // ---- DM actions --------------------------------------------------------

  async function startEncounter(event) {
    event.preventDefault();
    setBusy(true);
    await act(async () => {
      const created = await createEncounter(status, campaignId, { name: newName.trim() || 'Encounter' });
      // The whole party joins automatically — the DM adds monsters next.
      await Promise.all(
        sheets.map((s) =>
          addCombatant(status, campaignId, {
            encounterId: created.id,
            characterId: s.id,
            name: s.name,
            isPc: true,
            dexModifier: abilityMod(s.abilities?.dex),
          }),
        ),
      );
      setNewName('');
    });
    setBusy(false);
  }

  // One button to start the fight: anyone who hasn't rolled initiative
  // yet (monster or PC) gets rolled for now, then the turn goes to the
  // top of the order. No separate "roll for the NPCs" step to remember.
  function beginCombat() {
    if (ordered.length === 0) return;
    act(async () => {
      const settled = await Promise.all(
        ordered.map((c) =>
          hasRolled(c) ? c : updateCombatant(status, campaignId, c.id, { initiative: rollInitiative(c.dexModifier) }),
        ),
      );
      const first = sortCombatants(settled)[0];
      await updateEncounter(status, campaignId, encounter.id, { currentCombatantId: first.id, round: 1 });
    });
  }

  function step(direction) {
    const patch = stepTurn(encounter, ordered, direction);
    if (Object.keys(patch).length === 0) return;
    act(() => updateEncounter(status, campaignId, encounter.id, patch));
  }

  function endEncounter() {
    if (!confirmEnd) {
      setConfirmEnd(true);
      return;
    }
    setConfirmEnd(false);
    act(() => updateEncounter(status, campaignId, encounter.id, { active: false, currentCombatantId: null }));
  }

  function removeFromEncounter(combatant) {
    act(async () => {
      // Removing whoever's up hands the turn to the next in line rather
      // than leaving the marker pointing at nobody.
      if (combatant.id === encounter.currentCombatantId) {
        const rest = ordered.filter((c) => c.id !== combatant.id);
        const index = ordered.findIndex((c) => c.id === combatant.id);
        const next = rest[index] || rest[0] || null;
        await updateEncounter(status, campaignId, encounter.id, { currentCombatantId: next?.id ?? null });
      }
      await removeCombatant(status, campaignId, combatant.id);
    });
  }

  function addCombatants(entries) {
    return act(() => Promise.all(entries.map((fields) => addCombatant(status, campaignId, { encounterId: encounter.id, ...fields }))));
  }

  // ---- Per-combatant actions (DM, or a player on their own PC) ----------

  function applyHp(combatant, amount) {
    if (combatant.isPc) {
      const sheet = sheetsById[combatant.characterId];
      if (!sheet) return;
      act(() => updateSheet(status, campaignId, sheet.id, hpPatch(sheet, amount)));
    } else {
      act(() => updateCombatant(status, campaignId, combatant.id, combatantHpPatch(combatant, amount)));
    }
  }

  function setInitiative(combatant, value) {
    act(() =>
      isDM
        ? updateCombatant(status, campaignId, combatant.id, { initiative: value })
        : setOwnInitiative(status, campaignId, combatant.id, value),
    );
  }

  function addConditionTo(combatant, label) {
    if (combatant.isPc) {
      act(() =>
        addCondition(status, campaignId, { characterId: combatant.characterId, label, note: '', visibleToParty: true }),
      );
    } else {
      const next = [...new Set([...(combatant.conditions || []), label])];
      act(() => updateCombatant(status, campaignId, combatant.id, { conditions: next }));
    }
  }

  function removeConditionFrom(combatant, condition) {
    if (combatant.isPc) {
      act(() => removeCondition(status, campaignId, condition.id));
    } else {
      const next = (combatant.conditions || []).filter((c) => c !== condition.label);
      act(() => updateCombatant(status, campaignId, combatant.id, { conditions: next }));
    }
  }

  // ---- Render -------------------------------------------------------------

  if (loading) return <p>Gathering the combatants…</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {error && <p className="error-text">{error}</p>}

      {!encounter && (
        <Panel corners topRule>
          <h3 style={{ fontSize: '1.05rem', textAlign: 'center' }}>No Battle in Progress</h3>
          {isDM ? (
            <form onSubmit={startEncounter} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
              <p className="hint-text" style={{ textAlign: 'center' }}>
                Starting pulls in every character in this campaign — add the opposition next.
              </p>
              <div className="field">
                <label htmlFor="encounterName">Encounter name (optional)</label>
                <input
                  id="encounterName"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ambush at the Sea Caves"
                  maxLength={120}
                />
              </div>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? 'Drawing steel…' : 'Start Encounter'}
              </button>
            </form>
          ) : (
            <p style={{ textAlign: 'center', marginTop: '0.75rem' }}>
              {isGuest
                ? 'In guest mode, combat is tracked on the DM’s own device.'
                : 'When the DM starts a fight, the turn order will appear here — live.'}
            </p>
          )}
        </Panel>
      )}

      {encounter && (
        <>
          <Panel corners topRule>
            <div className="combat-header">
              <div>
                <h3 style={{ fontSize: '1.1rem' }}>{encounter.name}</h3>
                <p style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}>
                  {current ? (
                    <>
                      Round {encounter.round} · <span style={{ color: 'var(--gold-bright)' }}>{current.name}</span>’s turn
                    </>
                  ) : isDM ? (
                    'Add everyone, then Begin. Players can roll their own initiative — anyone who hasn’t is rolled for them when you begin.'
                  ) : myUnrolled ? (
                    'Roll for initiative — tap d20 on your character, or type in your own roll.'
                  ) : (
                    'Waiting for the DM to begin…'
                  )}
                </p>
              </div>
            </div>

            {myTurn && <p className="combat-your-turn">It’s your turn!</p>}

            {isDM && (
              <div className="combat-controls">
                {!current ? (
                  <button className="btn btn-primary btn-small" type="button" onClick={beginCombat} disabled={ordered.length === 0}>
                    Begin Combat
                  </button>
                ) : (
                  <>
                    <button
                      className="btn btn-ghost btn-small"
                      type="button"
                      onClick={() => step(-1)}
                      disabled={encounter.round <= 1 && ordered[0]?.id === current.id}
                    >
                      ◀ Back
                    </button>
                    <button className="btn btn-primary btn-small" type="button" onClick={() => step(1)}>
                      Next Turn ▶
                    </button>
                  </>
                )}
                <button className={`btn btn-small ${confirmEnd ? 'btn-danger' : 'btn-ghost'}`} type="button" onClick={endEncounter}>
                  {confirmEnd ? 'Tap again to end' : 'End Encounter'}
                </button>
              </div>
            )}
          </Panel>

          {ordered.length === 0 && <p>No one’s in this fight yet{isDM ? ' — add combatants below.' : '.'}</p>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {ordered.map((c) => {
              const sheet = c.isPc ? sheetsById[c.characterId] : null;
              return (
                <CombatantRow
                  key={c.id}
                  combatant={c}
                  sheet={sheet}
                  pcConditions={c.isPc ? conditionsByCharacter[c.characterId] || [] : null}
                  isCurrent={c.id === current?.id}
                  isDM={isDM}
                  isMine={c.isPc && isMyCharacter(sheet)}
                  canEditInitiative={isDM || (c.isPc && isMyCharacter(sheet))}
                  canEditHp={isDM || (c.isPc && ownsSheet(sheet))}
                  onHp={(amount) => applyHp(c, amount)}
                  onInitiative={(value) => setInitiative(c, value)}
                  onRollInitiative={() => setInitiative(c, rollInitiative(c.dexModifier))}
                  onRemove={() => removeFromEncounter(c)}
                  onAddCondition={(label) => addConditionTo(c, label)}
                  onRemoveCondition={(cond) => removeConditionFrom(c, cond)}
                />
              );
            })}
          </div>

          {isDM && (
            <AddCombatantForm
              creatures={creatures}
              availableSheets={sheets.filter((s) => !ordered.some((c) => c.characterId === s.id))}
              onAdd={addCombatants}
            />
          )}
        </>
      )}

      {shareRolls && (
        <TableRolls
          rolls={rolls}
          isDM={isDM}
          onClear={() => act(() => clearRolls(campaignId))}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------

function CombatantRow({
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

function AddCombatantForm({ creatures, availableSheets, onAdd }) {
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

function TableRolls({ rolls, isDM, onClear }) {
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!confirm) return undefined;
    const t = window.setTimeout(() => setConfirm(false), 3000);
    return () => window.clearTimeout(t);
  }, [confirm]);

  return (
    <Panel>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
        <h3 style={{ fontSize: '0.95rem' }}>Table Rolls</h3>
        {isDM && rolls.length > 0 && (
          <button
            className={`btn btn-small ${confirm ? 'btn-danger' : 'btn-ghost'}`}
            type="button"
            onClick={() => {
              if (confirm) {
                setConfirm(false);
                onClear();
              } else setConfirm(true);
            }}
          >
            {confirm ? 'Tap again to clear' : 'Clear'}
          </button>
        )}
      </div>
      {rolls.length === 0 ? (
        <p className="hint-text" style={{ marginTop: '0.5rem' }}>
          Rolls made with the dice button while you’re in this campaign show up here for the whole table.
        </p>
      ) : (
        <ul className="table-rolls">
          {rolls.map((r) => {
            const single = Array.isArray(r.rolls) && r.rolls.length === 1 && /^1d20\b/.test(r.expression);
            const crit = single && r.rolls[0] === 20;
            const fumble = single && r.rolls[0] === 1;
            return (
              <li key={r.id} className={crit ? 'roll-crit' : fumble ? 'roll-fumble' : ''}>
                <span className="table-roll-who">{r.displayName}</span>
                <span className="table-roll-expr">{r.expression}</span>
                <span className="table-roll-total">{r.total}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
