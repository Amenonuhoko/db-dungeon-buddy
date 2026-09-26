import { useState } from 'react';
import { ConfirmButton } from './ConfirmButton.jsx';
import { AREA_COLORS, AREA_KINDS, AREA_PRESETS, FOG_BRUSHES, isArea, isAimed, MARKERS } from '../lib/mapmarks.js';

// The DM's Map sheet (fog of war, markers, spell areas), the floating bar
// while a map tool is in hand, and what a tapped mark offers.

export function MapSections({ fog, hasGrid, onFog, onTool }) {
  const [custom, setCustom] = useState({ kind: 'circle', size: 20 });
  return (
    <>
      <section>
        <h4>Fog of war</h4>
        {fog ? (
          <div className="preset-grid">
            <button type="button" className="preset-chip active" onClick={() => onTool({ type: 'fog', mode: 'r', width: FOG_BRUSHES[1].width })}>
              Reveal by painting
            </button>
            <button type="button" className="preset-chip" onClick={() => onTool({ type: 'fog', mode: 'h', width: FOG_BRUSHES[1].width })}>
              Hide by painting
            </button>
            <button type="button" className="preset-chip" onClick={() => onFog({ on: true, strokes: [] })}>
              Cover everything again
            </button>
            <button type="button" className="preset-chip" onClick={() => onFog(null)}>
              Lift the fog
            </button>
          </div>
        ) : (
          <>
            <p className="hint-text" style={{ margin: 0 }}>
              Cover the map, then paint rooms open as the party explores. You see through it; they don't — except their own tokens.
            </p>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => {
                onFog({ on: true, strokes: [] });
                onTool({ type: 'fog', mode: 'r', width: FOG_BRUSHES[1].width });
              }}
            >
              Cover the Map in Fog
            </button>
          </>
        )}
      </section>

      <section>
        <h4>Markers</h4>
        <div className="preset-grid">
          {MARKERS.map((m) => (
            <button key={m.kind} type="button" className="preset-chip" onClick={() => onTool({ type: 'place', hidden: Boolean(m.hidden), preset: { kind: m.kind, label: m.kind === 'label' ? 'Note' : null } })}>
              {m.name}
              {m.hidden ? ' (hidden)' : ''}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h4>Spell areas</h4>
        {!hasGrid && <p className="hint-text" style={{ margin: 0 }}>Without a grid, 5 ft is taken as 5% of the width — set up a grid for true sizes.</p>}
        <div className="preset-grid">
          {AREA_PRESETS.map((a) => (
            <button
              key={a.name}
              type="button"
              className="preset-chip"
              style={{ '--area': AREA_COLORS[a.color] }}
              onClick={() => onTool({ type: 'place', hidden: false, preset: { kind: a.kind, sizeFt: a.size, color: a.color, label: a.name } })}
            >
              <span className="area-dot" aria-hidden="true" />
              {a.name}
            </button>
          ))}
        </div>
        <div className="group-bar-row">
          <select className="scene-tools-select" value={custom.kind} onChange={(e) => setCustom({ ...custom, kind: e.target.value })} aria-label="Shape">
            {AREA_KINDS.map((k) => (
              <option key={k} value={k}>
                {k === 'square' ? 'cube' : k}
              </option>
            ))}
          </select>
          <input
            className="hp-adjust-input"
            type="number"
            min="5"
            max="500"
            step="5"
            value={custom.size}
            onChange={(e) => setCustom({ ...custom, size: Math.min(500, Math.max(5, Number(e.target.value) || 5)) })}
            aria-label="Size in feet"
          />
          <span>ft</span>
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => onTool({ type: 'place', hidden: false, preset: { kind: custom.kind, sizeFt: custom.size, color: 'plain', label: null } })}
          >
            Place
          </button>
        </div>
      </section>
    </>
  );
}

// The floating bar while a tool is in hand.
export function MapToolBar({ tool, onChange, onDone }) {
  if (tool.type === 'fog') {
    return (
      <div className="group-bar" role="toolbar" aria-label="Fog brush">
        <p className="group-bar-hint">{tool.mode === 'r' ? 'Paint to reveal — the table sees each stroke.' : 'Paint to hide again.'}</p>
        <div className="preset-grid">
          <button type="button" className={`preset-chip${tool.mode === 'r' ? ' active' : ''}`} onClick={() => onChange({ ...tool, mode: 'r' })}>
            Reveal
          </button>
          <button type="button" className={`preset-chip${tool.mode === 'h' ? ' active' : ''}`} onClick={() => onChange({ ...tool, mode: 'h' })}>
            Hide
          </button>
          {FOG_BRUSHES.map((b) => (
            <button key={b.id} type="button" className={`preset-chip${tool.width === b.width ? ' active' : ''}`} onClick={() => onChange({ ...tool, width: b.width })}>
              {b.name}
            </button>
          ))}
          <button type="button" className="preset-chip" onClick={onDone}>
            Done
          </button>
        </div>
      </div>
    );
  }
  const p = tool.preset;
  const name = p.label || (isArea(p) ? `${p.sizeFt} ft ${p.kind}` : p.kind);
  return (
    <div className="group-bar" role="toolbar" aria-label="Place on the map">
      <p className="group-bar-hint">
        Tap the map to place {name}
        {isAimed(p.kind) ? ' — drag from where it starts to aim it.' : '.'}
      </p>
      <div className="preset-grid">
        <label className="lookup-check">
          <input type="checkbox" checked={tool.hidden} onChange={(e) => onChange({ ...tool, hidden: e.target.checked })} />
          Hidden from players
        </label>
        <button type="button" className="preset-chip" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// What a tapped mark offers the DM.
export function MarkPanel({ mark, onChange, onRemove, onPickInside, onReveal }) {
  const [label, setLabel] = useState(mark.label || '');
  const area = isArea(mark);
  return (
    <div className="mark-panel">
      {mark.dmOnly && <p className="scene-token-hidden-note">Hidden — only you can see this.</p>}
      <form
        className="scene-log-form"
        onSubmit={(e) => {
          e.preventDefault();
          onChange({ label: label.trim().slice(0, 120) || null });
        }}
      >
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" maxLength={120} aria-label="Label" />
        <button type="submit" className="btn btn-ghost btn-small">
          Save
        </button>
      </form>
      {area && (
        <>
          <div className="group-bar-row">
            <button type="button" className="btn btn-ghost btn-small" onClick={() => onChange({ sizeFt: Math.max(5, mark.sizeFt - 5) })}>
              − 5 ft
            </button>
            <strong>{mark.sizeFt} ft</strong>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => onChange({ sizeFt: Math.min(500, mark.sizeFt + 5) })}>
              + 5 ft
            </button>
            {isAimed(mark.kind) && (
              <>
                <button type="button" className="btn btn-ghost btn-small" onClick={() => onChange({ angle: ((mark.angle || 0) - 15 + 360) % 360 })} aria-label="Turn left">
                  ⟲
                </button>
                <button type="button" className="btn btn-ghost btn-small" onClick={() => onChange({ angle: ((mark.angle || 0) + 15) % 360 })} aria-label="Turn right">
                  ⟳
                </button>
              </>
            )}
          </div>
          <div className="preset-grid">
            {Object.entries(AREA_COLORS).map(([key, color]) => (
              <button
                key={key}
                type="button"
                className={`preset-chip${mark.color === key ? ' active' : ''}`}
                style={{ '--area': color }}
                onClick={() => onChange({ color: key })}
              >
                <span className="area-dot" aria-hidden="true" />
                {key}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-primary btn-small" style={{ alignSelf: 'flex-start' }} onClick={onPickInside}>
            Pick Everyone Inside
          </button>
        </>
      )}
      <div className="scene-token-actions">
        <button type="button" className={`btn btn-small ${mark.dmOnly ? 'btn-primary' : 'btn-ghost'}`} onClick={() => onReveal(mark.dmOnly)}>
          {mark.dmOnly ? 'Reveal to Players' : 'Hide from Players'}
        </button>
        <ConfirmButton className="btn btn-ghost btn-small" confirmLabel="Tap again to remove" onConfirm={onRemove}>
          Remove
        </ConfirmButton>
      </div>
    </div>
  );
}
