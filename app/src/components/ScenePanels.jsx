import { useState } from 'react';
import { MOOD_GROUPS, MOOD_PRESETS, moodName, sameMood } from '../lib/mood.js';
import { BACKDROPS, backdropUrl, useSceneArt } from '../lib/scenes.js';

// The DM's Scene sheet: every scene as a picture to tap, and a new scene
// from any built-in backdrop in one tap. With "Show straight away" on,
// tapping is showing — the table sees it at once.
export function ScenePanel({ scenes, current, onOpen, onCreate }) {
  const [showNow, setShowNow] = useState(true);
  const [naming, setNaming] = useState(null);

  return (
    <div className="scene-panel">
      <label className="scene-panel-toggle">
        <input type="checkbox" checked={showNow} onChange={(e) => setShowNow(e.target.checked)} />
        Show to players straight away
      </label>

      {scenes.length > 0 && (
        <section>
          <h4>Your scenes</h4>
          <div className="scene-tiles">
            {scenes.map((s) => (
              <SceneTile key={s.id} scene={s} current={current?.id === s.id} onClick={() => onOpen(s, showNow)} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h4>New scene from a backdrop</h4>
        <div className="scene-tiles">
          {BACKDROPS.map((b) => (
            <button key={b.id} type="button" className="scene-tile" onClick={() => onCreate(b.name, b.id, showNow)}>
              <img src={backdropUrl(b.id)} alt="" loading="lazy" />
              <span>{b.name}</span>
            </button>
          ))}
          {naming === null ? (
            <button type="button" className="scene-tile scene-tile-blank" onClick={() => setNaming('')}>
              <span className="scene-tile-plus" aria-hidden="true">
                +
              </span>
              <span>Blank / my own picture</span>
            </button>
          ) : (
            <form
              className="scene-tile scene-tile-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (naming.trim()) onCreate(naming.trim().slice(0, 120), null, showNow);
              }}
            >
              <input value={naming} onChange={(e) => setNaming(e.target.value)} placeholder="Scene name" maxLength={120} autoFocus aria-label="Scene name" />
              <button type="submit" className="btn btn-primary btn-small" disabled={!naming.trim()}>
                Create
              </button>
            </form>
          )}
        </div>
        <p className="hint-text" style={{ margin: 0 }}>
          Add your own picture, rename or tidy a scene from More.
        </p>
      </section>
    </div>
  );
}

function SceneTile({ scene, current, onClick }) {
  const art = useSceneArt(scene.backgroundPath);
  return (
    <button type="button" className={`scene-tile${current ? ' current' : ''}`} onClick={onClick}>
      {art ? <img src={art} alt="" loading="lazy" /> : <span className="scene-tile-empty" aria-hidden="true" />}
      <span>
        {scene.name}
        {scene.active && <em className="scene-tile-live">Live</em>}
      </span>
    </button>
  );
}

// The DM's Mood sheet: presets first (one tap sets the whole feel), then
// each layer on its own — time of day, weather, light, magic — mixable.
export function MoodPanel({ mood, onChange, sceneLive }) {
  return (
    <div className="mood-panel">
      <p className="hint-text" style={{ margin: 0 }}>
        Now: <strong>{moodName(mood)}</strong>
        {sceneLive ? '' : ' — players see it once this scene is live.'}
      </p>
      <section>
        <h4>Presets</h4>
        <div className="preset-grid">
          {MOOD_PRESETS.map((p) => (
            <button key={p.id} type="button" className={`preset-chip${sameMood(p.mood, mood) ? ' active' : ''}`} onClick={() => onChange(p.mood)}>
              {p.name}
            </button>
          ))}
        </div>
      </section>
      {MOOD_GROUPS.map((g) => (
        <section key={g.key}>
          <h4>{g.label}</h4>
          <div className="preset-grid">
            {g.options.map((o) => (
              <button
                key={o.id}
                type="button"
                className={`preset-chip${mood[g.key] === o.id ? ' active' : ''}`}
                onClick={() => {
                  const next = { ...mood };
                  if (mood[g.key] === o.id) delete next[g.key];
                  else next[g.key] = o.id;
                  onChange(next);
                }}
              >
                {o.name}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
