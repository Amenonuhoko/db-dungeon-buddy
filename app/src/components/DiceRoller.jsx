import { useEffect, useRef, useState } from 'react';
import { Die } from './ornament/Die.jsx';
import { LaurelFlourish } from './ornament/Laurel.jsx';
import { Panel } from './ornament/Panel.jsx';

// Global utility, not tied to a session or campaign — rendered once at
// the App root (sibling to the router) so it survives navigation and is
// reachable from literally every screen, including the very first one,
// before a visitor has picked Guest/Join/Log In. No backend, no auth:
// pure client-side randomness via crypto.getRandomValues for a fairer
// distribution than Math.random().
const PRESETS = [4, 6, 8, 10, 12, 20, 100];
const MAX_HISTORY = 12;
const MAX_COUNT = 100;
const BUMP_MS = 260;
const ROLL_SPIN_MS = 480;
// A pool bigger than this shows the first MAX_VISIBLE_DICE dice plus a
// "+N more" chip rather than flooding the panel — the total is always
// computed over every die regardless of how many are actually drawn.
const MAX_VISIBLE_DICE = 24;

function rollOne(sides) {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  // buf[0] is uniform over [0, 2^32); this keeps the modulo bias
  // negligible for any die size a table would plausibly use.
  return (buf[0] % sides) + 1;
}

function rollDice(count, sides, modifier) {
  const rolls = Array.from({ length: count }, () => rollOne(sides));
  const total = rolls.reduce((sum, r) => sum + r, 0) + modifier;
  return { id: crypto.randomUUID(), count, sides, modifier, rolls, total };
}

function formatExpression({ count, sides, modifier }) {
  const mod = modifier === 0 ? '' : modifier > 0 ? ` + ${modifier}` : ` − ${Math.abs(modifier)}`;
  return `${count}d${sides}${mod}`;
}

function DiceIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <circle cx="8.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function DiceRoller() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(1);
  const [sides, setSides] = useState(20);
  // Blank, not 0, so the "+5" placeholder is visible until the table
  // actually wants a modifier — see the field below.
  const [modifier, setModifier] = useState('');
  const [history, setHistory] = useState([]);
  const [bumpSides, setBumpSides] = useState(null);
  const [rolling, setRolling] = useState(false);
  const bumpTimeout = useRef(null);
  const rollTimeout = useRef(null);
  const fabRef = useRef(null);
  const panelRef = useRef(null);

  const effectiveModifier = modifier === '' ? 0 : Number(modifier) || 0;

  // Nothing dims behind the panel and it's reachable from every screen —
  // without this, it was possible to open it over a short screen (the
  // panel can run to ~350px tall) and find the real page underneath
  // completely unclickable, with re-tapping the FAB the only way out. A
  // tap outside, or Escape, closes it the way a floating panel should.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event) {
      if (panelRef.current?.contains(event.target)) return;
      if (fabRef.current?.contains(event.target)) return;
      setOpen(false);
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function addRoll(result) {
    setHistory((prev) => [result, ...prev].slice(0, MAX_HISTORY));
  }

  // Tapping a preset builds the pool rather than rolling immediately:
  // the same die tapped again adds one more to Count (three taps on d6
  // → 3d6), a different die swaps the selection and starts a fresh
  // count of 1. Hit Roll to actually roll the pool. The brief "bump"
  // class is the "another die was added" cue — small, not a full
  // animated die joining a pile, but enough to feel like a confirmed tap.
  function tapPreset(dieSides) {
    setSides(dieSides);
    setCount((prev) => (dieSides === sides ? Math.min(prev + 1, MAX_COUNT) : 1));
    setBumpSides(dieSides);
    window.clearTimeout(bumpTimeout.current);
    bumpTimeout.current = window.setTimeout(() => setBumpSides(null), BUMP_MS);
  }

  function handleRoll(event) {
    event.preventDefault();
    const safeCount = Math.min(Math.max(Number(count) || 1, 1), MAX_COUNT);
    const safeSides = Math.min(Math.max(Number(sides) || 2, 2), 1000);
    addRoll(rollDice(safeCount, safeSides, effectiveModifier));
    setRolling(true);
    window.clearTimeout(rollTimeout.current);
    rollTimeout.current = window.setTimeout(() => setRolling(false), ROLL_SPIN_MS);
  }

  const latest = history[0];

  return (
    <>
      <button
        ref={fabRef}
        type="button"
        className={`dice-fab${open ? ' active' : ''}${rolling ? ' rolling' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close dice roller' : 'Open dice roller'}
        aria-pressed={open}
        title="Roll dice"
      >
        <DiceIcon />
      </button>

      {open && (
        <div className="dice-panel" ref={panelRef}>
          <Panel corners topRule>
            <LaurelFlourish>
              <h3 style={{ fontSize: '1rem' }}>Roll the Dice</h3>
            </LaurelFlourish>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', justifyContent: 'center', marginTop: '1.1rem' }}>
              {PRESETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`btn btn-small ${n === sides ? 'btn-primary' : 'btn-ghost'}${n === sides && bumpSides === n ? ' dice-bump' : ''}`}
                  onClick={() => tapPreset(n)}
                  title={n === sides ? `Tap again to add another d${n}` : `Select d${n}`}
                >
                  d{n}
                  {n === sides && count > 1 ? ` ×${count}` : ''}
                </button>
              ))}
            </div>
            <p className="hint-text" style={{ textAlign: 'center', marginTop: '0.5rem' }}>
              Tap a die again to roll more of it — three taps on d6 makes 3d6.
            </p>

            <form onSubmit={handleRoll} className="dice-roll-row">
              <input
                aria-label="Number of dice"
                type="number"
                min={1}
                max={MAX_COUNT}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                className="dice-input"
              />
              <span className="dice-d">d</span>
              <input
                aria-label="Die sides"
                type="number"
                min={2}
                max={1000}
                value={sides}
                onChange={(e) => setSides(e.target.value)}
                className="dice-input"
              />
              <span className="dice-mod-sign">+</span>
              <input
                aria-label="Modifier"
                type="number"
                value={modifier}
                onChange={(e) => setModifier(e.target.value)}
                placeholder="+5"
                className="dice-input dice-input-mod"
              />
              <button className="btn btn-primary btn-small" type="submit" style={{ flex: '1 1 100%', marginTop: '0.6rem' }}>
                Roll {count || 1}d{sides || 2}
                {effectiveModifier > 0 ? ` +${effectiveModifier}` : effectiveModifier < 0 ? ` ${effectiveModifier}` : ''}
              </button>
            </form>

            {latest && (
              <div key={latest.id} className="dice-result" style={{ marginTop: '1.25rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {formatExpression(latest)}
                </div>

                <div className="dice-face-row">
                  {latest.rolls.slice(0, MAX_VISIBLE_DICE).map((value, i) => (
                    <Die key={i} sides={latest.sides} value={value} index={i} />
                  ))}
                  {latest.rolls.length > MAX_VISIBLE_DICE && (
                    <span className="chip" style={{ alignSelf: 'center' }}>
                      +{latest.rolls.length - MAX_VISIBLE_DICE} more
                    </span>
                  )}
                </div>

                {(latest.rolls.length > 1 || latest.modifier !== 0) && (
                  <div
                    className="dice-result-total"
                    style={{
                      marginTop: '0.5rem',
                      animationDelay: `${Math.min(latest.rolls.length, MAX_VISIBLE_DICE) * 55 + 150}ms`,
                    }}
                  >
                    {latest.total}
                  </div>
                )}
              </div>
            )}

            {history.length > 0 && (
              <div style={{ marginTop: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontFamily: 'var(--font-display)', fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
                    History
                  </label>
                  <button className="btn btn-ghost btn-small" type="button" onClick={() => setHistory([])}>
                    Clear
                  </button>
                </div>
                {/* Includes the roll shown big above, not just the ones
                    before it — it lands in the log the instant it
                    happens, not on the next roll. */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.5rem', maxHeight: '9rem', overflowY: 'auto' }}>
                  {history.map((roll) => (
                    <div key={roll.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                      <span>{formatExpression(roll)}</span>
                      <span style={{ color: 'var(--text)' }}>{roll.total}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
