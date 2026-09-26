import { useRef, useState } from 'react';
import { Portrait } from './Portrait.jsx';
import { clamp01, useSceneArt } from '../lib/scenes.js';

// The scene itself: the DM's picture, fitted to the screen, with everyone
// standing on it. With `showInfo` a token carries what combat needs at a
// glance — whose turn, initiative, health, conditions, name; without it
// the picture and portraits stand alone, and only moments (a hit, a heal,
// a condition, an arrival, a turn) play over them and fade. Tap a token
// to open it; drag one you're allowed to move. Positions are fractions of
// the picture, so the same scene lines up on every screen.
const DRAG_START_PX = 5;
const BLANK_RATIO = 4 / 3;

export function SceneStage({ artPath, tokens, selectedKey, showInfo, moments, onSelect, onMove, onBackground }) {
  const art = useSceneArt(artPath);
  const stageRef = useRef(null);
  const drag = useRef(null);
  const justDragged = useRef(false);
  const [dragPos, setDragPos] = useState(null); // { key, x, y } while dragging
  const [ratio, setRatio] = useState({ src: null, value: BLANK_RATIO });
  const aspect = art && ratio.src === art ? ratio.value : BLANK_RATIO;

  function spotFor(event) {
    const rect = stageRef.current.getBoundingClientRect();
    return {
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height),
    };
  }

  function onPointerDown(event, token) {
    if (!token.draggable || event.button > 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { key: token.key, startX: event.clientX, startY: event.clientY, moved: false };
  }

  function onPointerMove(event) {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(event.clientX - d.startX, event.clientY - d.startY) < DRAG_START_PX) return;
    d.moved = true;
    setDragPos({ key: d.key, ...spotFor(event) });
  }

  function onPointerUp(event, token) {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    justDragged.current = true;
    const spot = spotFor(event);
    setDragPos(null);
    onMove(token.key, Math.round(spot.x * 1000) / 1000, Math.round(spot.y * 1000) / 1000);
  }

  // A tap (or Enter) opens the token; the click that ends a drag doesn't.
  function onClick(event, token) {
    event.stopPropagation();
    if (justDragged.current) {
      justDragged.current = false;
      return;
    }
    onSelect(token.key === selectedKey ? null : token.key);
  }

  return (
    <div className="scene-viewport" onClick={onBackground}>
      <div
        ref={stageRef}
        className={`scene-stage${art ? '' : ' scene-stage-blank'}${showInfo ? ' show-info' : ''}`}
        style={{ '--scene-ratio': aspect }}
      >
        {art && (
          <img
            className="scene-art"
            src={art}
            alt=""
            draggable={false}
            onLoad={(e) => setRatio({ src: art, value: e.currentTarget.naturalWidth / e.currentTarget.naturalHeight || BLANK_RATIO })}
          />
        )}
        {tokens.map((token) => {
          const pos = dragPos?.key === token.key ? dragPos : token;
          const active = moments[token.key] || [];
          const classes = [
            'scene-token',
            `scene-token-${token.kind}`,
            token.isCurrent && 'current',
            token.down && 'down',
            token.hidden && 'off-scene',
            token.mine && 'mine',
            token.draggable && 'draggable',
            selectedKey === token.key && 'selected',
            dragPos?.key === token.key && 'dragging',
            ...active.map((m) => `moment-${m.kind}`),
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={token.key}
              type="button"
              className={classes}
              style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}
              onPointerDown={(e) => onPointerDown(e, token)}
              onPointerMove={onPointerMove}
              onPointerUp={(e) => onPointerUp(e, token)}
              onPointerCancel={() => {
                drag.current = null;
                setDragPos(null);
              }}
              onClick={(e) => onClick(e, token)}
              aria-label={token.ariaLabel}
              aria-pressed={selectedKey === token.key}
            >
              <span className="scene-token-disc">
                <Portrait path={token.portraitPath} name={token.name} size="sm" />
                {token.initiative != null && <span className="scene-token-init scene-info">{token.initiative}</span>}
                {token.down && (
                  <span className="scene-token-down" aria-hidden="true">
                    ✕
                  </span>
                )}
              </span>
              {token.hpPct != null && (
                <span className="scene-token-hp scene-info" aria-hidden="true">
                  <span className={`hp-track-fill hp-track-fill-${token.hpBand}`} style={{ width: `${token.hpPct}%` }} />
                </span>
              )}
              <span className="scene-token-name scene-info">{token.name}</span>
              {token.conditions.length > 0 && (
                <span className="scene-token-conditions scene-info" aria-hidden="true">
                  {token.conditions.slice(0, 2).map((c) => (
                    <span key={c} className="scene-token-condition">
                      {c.slice(0, 4)}
                    </span>
                  ))}
                  {token.conditions.length > 2 && <span className="scene-token-condition">+{token.conditions.length - 2}</span>}
                </span>
              )}
              {active
                .filter((m) => m.text)
                .map((m) => (
                  <span key={m.id} className={`scene-float scene-float-${m.kind}`} aria-hidden="true">
                    {m.text}
                  </span>
                ))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
