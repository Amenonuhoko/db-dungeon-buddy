import { useState } from 'react';
import { ABILITY_KEYS, BLANK_PICKS, finalizeQuickFields, modifier } from '../lib/characters.js';
import {
  ABILITY_NAMES,
  applyBonuses,
  BACKGROUNDS,
  bestFit,
  BONUS_MODES,
  CLASS_INFO,
  classBasics,
  HIT_DICE,
  inspire,
  POINT_BUY_BUDGET,
  POINT_BUY_COST,
  pointBuySpent,
  roll4d6,
  STANDARD_ARRAY,
  suggestAc,
  suggestHp,
  suggestResources,
  suggestSpeed,
} from '../lib/builder.js';
import { QuickCharacterFields } from './QuickCharacterFields.jsx';

// The guided character builder — the step-by-step alternative to the
// quick form, everywhere a character gets made (the "Choose your
// character" step, the Party tab, My Characters). Four steps: who they
// are; ability scores (standard array, point buy, 4d6 or typed in, plus
// the +2/+1); background and personality; then a review with suggested
// HP, AC, speed and class resources, all editable. What it hands to
// onSubmit is the same shape the quick form makes, just fuller — see
// lib/builder.js for where each suggestion comes from.
//
// `children` render on the last step, above the button — the caller's
// own extras ("Played by", "Also keep in My Characters").
const STEPS = ['Who', 'Abilities', 'Story', 'Review'];

const METHODS = [
  {
    id: 'standard',
    label: 'Standard array',
    hint: 'Six set scores — 15, 14, 13, 12, 10, 8 — to place where you like.',
  },
  {
    id: 'pointbuy',
    label: 'Point buy',
    hint: `Every score starts at 8; spend ${POINT_BUY_BUDGET} points to raise them (15 at most).`,
  },
  {
    id: 'roll',
    label: 'Roll 4d6',
    hint: 'Roll four d6 six times, keep the best three each time, then place them.',
  },
  {
    id: 'manual',
    label: 'Type them in',
    hint: 'Already rolled at the table, or copying a sheet? Enter the scores.',
  },
];

const BLANK_ASSIGN = Object.fromEntries(ABILITY_KEYS.map((k) => [k, '']));
const EIGHTS = Object.fromEntries(ABILITY_KEYS.map((k) => [k, 8]));
const TENS = Object.fromEntries(ABILITY_KEYS.map((k) => [k, 10]));
const STORY_FIELDS = [
  ['personalityTraits', 'Personality trait', 'How do they come across?'],
  ['ideals', 'Ideal', 'What do they believe in?'],
  ['bonds', 'Bond', 'Who or what do they care about?'],
  ['flaws', 'Flaw', 'What gets them into trouble?'],
];

export function CharacterBuilder({
  extraClasses = [],
  extraRaces = [],
  onSubmit,
  onCancel,
  busy,
  submitLabel = 'Create Character',
  canSubmit = true,
  children,
}) {
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [form, setForm] = useState({
    name: '',
    maxHp: '',
    armorClass: '',
    currentHp: '',
  });
  const [picks, setPicks] = useState(BLANK_PICKS);
  const [customHitDie, setCustomHitDie] = useState(8);

  const [method, setMethod] = useState('standard');
  const [assign, setAssign] = useState(BLANK_ASSIGN);
  const [rolls, setRolls] = useState([]);
  const [points, setPoints] = useState(EIGHTS);
  const [manual, setManual] = useState(TENS);
  const [bonusMode, setBonusMode] = useState('two-one');
  const [bonusPicks, setBonusPicks] = useState(['', '', '']);

  const [background, setBackground] = useState('');
  const [customBackground, setCustomBackground] = useState('');
  const [backgroundDetail, setBackgroundDetail] = useState('');
  const [story, setStory] = useState({
    personalityTraits: '',
    ideals: '',
    bonds: '',
    flaws: '',
    backstory: '',
  });

  const [overrides, setOverrides] = useState({
    maxHp: null,
    armorClass: null,
    speed: null,
  });
  const [addResources, setAddResources] = useState(true);

  const className = picks.classChoice === 'Other' ? picks.customClass.trim() : picks.classChoice;
  const race = picks.raceChoice === 'Other' ? picks.customRace.trim() : picks.raceChoice;
  const level = Math.max(1, Math.min(20, Number(picks.level) || 1));
  const info = CLASS_INFO[className];
  const hitDie = info?.hitDie ?? customHitDie;

  // --- ability scores ---------------------------------------------------
  const arrayValues = method === 'standard' ? STANDARD_ARRAY : rolls.map((r) => r.total);
  const base = Object.fromEntries(
    ABILITY_KEYS.map((k) => {
      if (method === 'pointbuy') return [k, points[k]];
      if (method === 'manual') return [k, manual[k] === '' ? null : Number(manual[k])];
      return [k, assign[k] === '' ? null : arrayValues[assign[k]]];
    }),
  );
  const scoresComplete = ABILITY_KEYS.every((k) => base[k] != null && base[k] >= 1 && base[k] <= 30);
  const spent = pointBuySpent(points);
  const bonusNeeded = bonusMode === 'two-one' ? 2 : bonusMode === 'three-ones' ? 3 : 0;
  const bonusComplete = bonusPicks.slice(0, bonusNeeded).every(Boolean);
  const abilities = scoresComplete ? applyBonuses(base, bonusMode, bonusPicks) : null;

  function chooseMethod(next) {
    setMethod(next);
    setAssign(BLANK_ASSIGN);
  }

  function rollAll() {
    setRolls(Array.from({ length: 6 }, roll4d6));
    setAssign(BLANK_ASSIGN);
  }

  function fitToClass() {
    if (arrayValues.length === 6) setAssign(bestFit(arrayValues, className));
  }

  function bump(key, delta) {
    const next = points[key] + delta;
    if (next < 8 || next > 15) return;
    const trial = { ...points, [key]: next };
    if (pointBuySpent(trial) > POINT_BUY_BUDGET) return;
    setPoints(trial);
  }

  function setBonusPick(index, key) {
    setBonusPicks((prev) => prev.map((p, i) => (i === index ? key : p)));
  }

  // --- suggestions -------------------------------------------------------
  const acSuggestion = abilities ? suggestAc(className, abilities) : null;
  const suggested = abilities
    ? {
        maxHp: suggestHp(hitDie, level, abilities.con),
        armorClass: acSuggestion.ac,
        speed: suggestSpeed(race),
      }
    : null;
  const vital = (key) => overrides[key] ?? suggested?.[key] ?? '';
  const resources = abilities ? suggestResources(className, level, abilities) : [];
  const backgroundName = background === 'Other' ? customBackground.trim() : background;

  // --- steps -------------------------------------------------------------
  const blockers = [
    !form.name.trim() ? 'Give them a name first.' : null,
    !scoresComplete
      ? method === 'roll' && rolls.length === 0
        ? 'Roll the dice first.'
        : 'Give every ability a score.'
      : method === 'pointbuy' && spent > POINT_BUY_BUDGET
        ? 'That spends too many points.'
        : !bonusComplete
          ? 'Pick where the bonuses go.'
          : null,
    null,
    null,
  ];
  const canAdvance = !blockers[step];
  const firstBlocked = blockers.findIndex(Boolean);

  function go(next) {
    setStep(next);
    setReached((r) => Math.max(r, next));
  }

  async function submit() {
    if (busy || !canSubmit || blockers.some(Boolean)) return;
    const quick = finalizeQuickFields(
      {
        name: form.name,
        maxHp: vital('maxHp'),
        armorClass: vital('armorClass'),
        currentHp: '',
      },
      { ...picks, level: String(level) },
    );
    const fields = {
      ...quick,
      abilities,
      speed: String(vital('speed')).trim() || '30 ft.',
      background: backgroundName ? [backgroundName, backgroundDetail.trim()].filter(Boolean).join(' — ') : backgroundDetail.trim(),
      features: classBasics(className, hitDie, level),
      resources: addResources ? resources : [],
    };
    // Only what was filled in, so a backend still missing the 011 story
    // columns can take a builder character without them.
    for (const [key, value] of Object.entries(story)) if (value.trim()) fields[key] = value.trim();
    await onSubmit(fields);
  }

  return (
    <div className="builder">
      <ol className="builder-steps" aria-label="Steps">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              className={i === step ? 'active' : i <= reached ? 'done' : ''}
              aria-current={i === step ? 'step' : undefined}
              disabled={i > reached || (firstBlocked !== -1 && i > firstBlocked)}
              onClick={() => go(i)}
            >
              <span className="builder-step-num">{i + 1}</span>
              {label}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="builder-body">
          <p className="hint-text" style={{ margin: 0 }}>
            Who are they? Class and level decide hit points and class resources later on.
          </p>
          <QuickCharacterFields
            form={form}
            setForm={setForm}
            picks={picks}
            setPicks={setPicks}
            extraClasses={extraClasses}
            extraRaces={extraRaces}
            vitals={false}
          />
          {className && !info && (
            <div className="field" style={{ maxWidth: '12rem' }}>
              <label htmlFor="builderHitDie">Hit die</label>
              <select id="builderHitDie" value={customHitDie} onChange={(e) => setCustomHitDie(Number(e.target.value))}>
                {HIT_DICE.map((d) => (
                  <option key={d} value={d}>
                    d{d}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="builder-body">
          <div className="builder-methods" role="radiogroup" aria-label="How to get ability scores">
            {METHODS.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={method === m.id}
                className={method === m.id ? 'active' : ''}
                onClick={() => chooseMethod(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="hint-text" style={{ margin: 0 }}>
            {METHODS.find((m) => m.id === method).hint}
          </p>

          {method === 'roll' && (
            <div className="builder-rolls">
              {rolls.length === 0 ? (
                <button type="button" className="btn btn-primary btn-small" onClick={rollAll}>
                  Roll 4d6 six times
                </button>
              ) : (
                <>
                  <ul aria-label="Your rolls">
                    {rolls.map((r, i) => (
                      <li key={i} className="builder-roll">
                        <strong>{r.total}</strong>
                        <span className="builder-roll-dice">
                          {r.dice.map((d, j) => (
                            <span key={j} className={j === r.dropped ? 'dropped' : ''}>
                              {d}
                            </span>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <button type="button" className="btn btn-ghost btn-small" onClick={rollAll}>
                    Roll again
                  </button>
                </>
              )}
            </div>
          )}

          {method === 'pointbuy' && (
            <p className={`builder-points${spent > POINT_BUY_BUDGET ? ' over' : ''}`}>
              <strong>{POINT_BUY_BUDGET - spent}</strong> of {POINT_BUY_BUDGET} points left
            </p>
          )}

          {(method === 'standard' || (method === 'roll' && rolls.length > 0)) && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-ghost btn-small" onClick={fitToClass}>
                {info ? `Best fit for a ${className}` : 'Highest first'}
              </button>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => setAssign(BLANK_ASSIGN)}>
                Clear
              </button>
            </div>
          )}

          <ul className="builder-abilities">
            {ABILITY_KEYS.map((key) => {
              const final = abilities?.[key] ?? base[key];
              const save = info?.saves.includes(key);
              return (
                <li key={key}>
                  <label htmlFor={`score-${key}`} className="builder-ability-name">
                    <span className="builder-ability-full">{ABILITY_NAMES[key]}</span>
                    <span className="builder-ability-short" aria-hidden="true">
                      {key.toUpperCase()}
                    </span>
                    {save && (
                      <span className="builder-save" title="Saving throw proficiency">
                        save
                      </span>
                    )}
                  </label>
                  <div className="builder-ability-input">
                    {(method === 'standard' || method === 'roll') && (
                      <select
                        id={`score-${key}`}
                        value={assign[key]}
                        disabled={method === 'roll' && rolls.length === 0}
                        onChange={(e) =>
                          setAssign({
                            ...assign,
                            [key]: e.target.value === '' ? '' : Number(e.target.value),
                          })
                        }
                      >
                        <option value="">—</option>
                        {arrayValues.map((v, i) => (
                          <option key={i} value={i} disabled={Object.entries(assign).some(([k, idx]) => k !== key && idx === i)}>
                            {v}
                          </option>
                        ))}
                      </select>
                    )}
                    {method === 'pointbuy' && (
                      <span className="builder-stepper">
                        <button
                          type="button"
                          aria-label={`Lower ${ABILITY_NAMES[key]}`}
                          disabled={points[key] <= 8}
                          onClick={() => bump(key, -1)}
                        >
                          −
                        </button>
                        <output id={`score-${key}`}>{points[key]}</output>
                        <button
                          type="button"
                          aria-label={`Raise ${ABILITY_NAMES[key]}`}
                          disabled={
                            points[key] >= 15 || spent - POINT_BUY_COST[points[key]] + POINT_BUY_COST[points[key] + 1] > POINT_BUY_BUDGET
                          }
                          onClick={() => bump(key, 1)}
                        >
                          +
                        </button>
                      </span>
                    )}
                    {method === 'manual' && (
                      <input
                        id={`score-${key}`}
                        type="number"
                        min="1"
                        max="30"
                        value={manual[key]}
                        onChange={(e) => setManual({ ...manual, [key]: e.target.value })}
                      />
                    )}
                  </div>
                  <span className="builder-ability-final" aria-label={`${ABILITY_NAMES[key]} with bonuses`}>
                    {final != null ? (
                      <>
                        {final} <small>({modifier(final)})</small>
                      </>
                    ) : (
                      '—'
                    )}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="builder-bonus">
            <div className="field">
              <label htmlFor="bonusMode">Ability bonuses (from species or background)</label>
              <select
                id="bonusMode"
                value={bonusMode}
                onChange={(e) => {
                  setBonusMode(e.target.value);
                  setBonusPicks(['', '', '']);
                }}
              >
                {BONUS_MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            {Array.from({ length: bonusNeeded }, (_, i) => (
              <div className="field" key={i}>
                <label htmlFor={`bonus-${i}`}>{bonusMode === 'two-one' ? (i === 0 ? '+2 to' : '+1 to') : '+1 to'}</label>
                <select id={`bonus-${i}`} value={bonusPicks[i]} onChange={(e) => setBonusPick(i, e.target.value)}>
                  <option value="">Choose…</option>
                  {ABILITY_KEYS.map((k) => (
                    <option key={k} value={k} disabled={bonusPicks.some((p, j) => j !== i && j < bonusNeeded && p === k)}>
                      {ABILITY_NAMES[k]}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="builder-body">
          <p className="hint-text" style={{ margin: 0 }}>
            All optional — and all private to you and the DM. Stuck? Tap Idea for a prompt to riff on.
          </p>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: '1 1 160px' }}>
              <label htmlFor="builderBackground">Background</label>
              <select id="builderBackground" value={background} onChange={(e) => setBackground(e.target.value)}>
                <option value="">None yet</option>
                {BACKGROUNDS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
                <option value="Other">Other…</option>
              </select>
            </div>
            {background === 'Other' && (
              <div className="field" style={{ flex: '1 1 160px' }}>
                <label htmlFor="builderBackgroundCustom">Custom background</label>
                <input
                  id="builderBackgroundCustom"
                  value={customBackground}
                  maxLength={60}
                  onChange={(e) => setCustomBackground(e.target.value)}
                  placeholder="Smuggler"
                />
              </div>
            )}
          </div>
          <div className="field">
            <label htmlFor="builderBackgroundDetail">In a line — where do they come from?</label>
            <input
              id="builderBackgroundDetail"
              value={backgroundDetail}
              maxLength={200}
              onChange={(e) => setBackgroundDetail(e.target.value)}
              placeholder="Knows every back alley in Port Vessa."
            />
          </div>
          {STORY_FIELDS.map(([key, label, placeholder]) => (
            <div className="field" key={key}>
              <label htmlFor={`builder-${key}`}>{label}</label>
              <div className="builder-inspire">
                <input
                  id={`builder-${key}`}
                  value={story[key]}
                  maxLength={500}
                  onChange={(e) => setStory({ ...story, [key]: e.target.value })}
                  placeholder={placeholder}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  aria-label={`Idea for ${label.toLowerCase()}`}
                  onClick={() => setStory({ ...story, [key]: inspire(key, story[key]) })}
                >
                  Idea
                </button>
              </div>
            </div>
          ))}
          <div className="field">
            <label htmlFor="builderBackstory">Backstory</label>
            <textarea
              id="builderBackstory"
              value={story.backstory}
              maxLength={20000}
              onChange={(e) => setStory({ ...story, backstory: e.target.value })}
              placeholder="As much or as little as you like — you can add more on the sheet."
            />
          </div>
        </div>
      )}

      {step === 3 && abilities && (
        <div className="builder-body">
          <div className="builder-summary">
            <h3>{form.name.trim()}</h3>
            <p>{[[className, level].filter(Boolean).join(' '), race, backgroundName].filter(Boolean).join(' · ') || 'Adventurer'}</p>
            <ul className="builder-summary-abilities">
              {ABILITY_KEYS.map((k) => (
                <li key={k} className={info?.saves.includes(k) ? 'save' : ''}>
                  <span>{k.toUpperCase()}</span>
                  <strong>{abilities[k]}</strong>
                  <small>{modifier(abilities[k])}</small>
                </li>
              ))}
            </ul>
            <p className="hint-text" style={{ margin: 0 }}>
              {classBasics(className, hitDie, level)}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <VitalField
              id="builderHp"
              label="Max HP"
              type="number"
              value={vital('maxHp')}
              suggestion={suggested.maxHp}
              onChange={(v) => setOverrides({ ...overrides, maxHp: v })}
              hint={`d${hitDie} a level + CON`}
            />
            <VitalField
              id="builderAc"
              label="Armor Class"
              type="number"
              value={vital('armorClass')}
              suggestion={suggested.armorClass}
              onChange={(v) => setOverrides({ ...overrides, armorClass: v })}
              hint={acSuggestion.how}
            />
            <VitalField
              id="builderSpeed"
              label="Speed"
              value={vital('speed')}
              suggestion={suggested.speed}
              onChange={(v) => setOverrides({ ...overrides, speed: v })}
            />
          </div>

          {resources.length > 0 && (
            <div className="builder-resources">
              <label className="check-row">
                <input type="checkbox" checked={addResources} onChange={(e) => setAddResources(e.target.checked)} />
                Add {className}'s trackers to the sheet
              </label>
              <ul>
                {resources.map((r) => (
                  <li key={r.label} className={addResources ? '' : 'off'}>
                    {r.label} <strong>{r.max}</strong>
                    {r.shortRest && <span className="chip chip-small">short rest</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {children}
        </div>
      )}

      {blockers[step] && step < 3 && <p className="hint-text builder-blocker">{blockers[step]}</p>}

      <div className="builder-nav">
        {step > 0 ? (
          <button type="button" className="btn btn-ghost" onClick={() => go(step - 1)}>
            ← Back
          </button>
        ) : (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        {step < 3 ? (
          <button type="button" className="btn btn-primary" disabled={!canAdvance} onClick={() => go(step + 1)}>
            {step === 2 ? 'Review' : 'Next →'}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" disabled={busy || !canSubmit} onClick={submit}>
            {busy ? 'Saving…' : submitLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function VitalField({ id, label, type = 'text', value, suggestion, onChange, hint }) {
  const changed = String(value) !== String(suggestion);
  return (
    <div className="field" style={{ flex: '1 1 110px' }}>
      <label htmlFor={id}>{label}</label>
      <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} />
      <span className="builder-vital-hint">
        {changed ? (
          <button type="button" className="example-toggle" onClick={() => onChange(null)}>
            Use suggested ({suggestion})
          </button>
        ) : (
          hint
        )}
      </span>
    </div>
  );
}

export function CreateModeSwitch({ mode, setMode }) {
  return (
    <div className="party-views builder-mode" role="tablist" aria-label="How to make this character">
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'guided'}
        className={mode === 'guided' ? 'active' : ''}
        onClick={() => setMode('guided')}
      >
        Step by step
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'quick'}
        className={mode === 'quick' ? 'active' : ''}
        onClick={() => setMode('quick')}
      >
        Quick
      </button>
    </div>
  );
}
