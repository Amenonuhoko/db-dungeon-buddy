import { useEffect, useRef, useState } from 'react';
import { Portrait } from './Portrait.jsx';
import { AreaLabels, SceneAreas, SceneFog, SceneMarkers } from './SceneMarks.jsx';
import { SceneMood } from './SceneMood.jsx';
import { isAimed } from '../lib/mapmarks.js';
import { snapToGrid } from '../lib/formations.js';
import { clamp01, measureFeet, useSceneArt } from '../lib/scenes.js';

// The scene itself: the DM's picture, fitted to the screen, with everyone
// standing on it. With `showInfo` a token carries what combat needs at a
// glance — whose turn, initiative, health, conditions, name; without it
// the picture and portraits stand alone, and only moments (a hit, a heal,
// a condition, an arrival, a turn) play over them and fade.
//
// The picture pans and zooms (pinch, mouse wheel, drag; double-tap to
// reset), and can carry a grid. In `measuring` mode (the DM's), dragging
// across the picture draws a line and reads out the distance by the grid.
// Positions are fractions of the picture, so the same scene lines up on
// every screen at any zoom. With a grid, a dropped token snaps into its
// squares. Tokens in `picked` move together (the DM moving the party),
// and the DM can long-press anywhere to ping it for the whole table.
const DRAG_START_PX = 5;
const BLANK_RATIO = 4 / 3;
const MAX_ZOOM = 5;
const DOUBLE_TAP_MS = 320;
const HOME = { z: 1, x: 0, y: 0 };
const PING_HOLD_MS = 450;

export function SceneStage({
  artPath,
  tokens,
  selectedKey,
  showInfo,
  moments,
  grid,
  mood,
  lights,
  isDM,
  measuring,
  measure,
  picked,
  pings,
  onSelect,
  onMove,
  onBackground,
  onMeasure,
  onPing,
  onAspect,
  marks,
  fog,
  mapTool,
  onPaint,
  onPlaceMark,
  onMarkTap,
}) {
  const art = useSceneArt(artPath);
  const viewportRef = useRef(null);
  const stageRef = useRef(null);
  const drag = useRef(null);
  const justDragged = useRef(false);
  const [dragPos, setDragPos] = useState(null); // { key, x, y } while dragging a token
  const [ratio, setRatio] = useState({ src: null, value: BLANK_RATIO });
  const aspect = art && ratio.src === art ? ratio.value : BLANK_RATIO;
  useEffect(() => {
    onAspect?.(aspect);
  }, [aspect, onAspect]);
  const holdTimer = useRef(null);

  // ---- Pan and zoom -------------------------------------------------------
  // The zoom layer is the viewport's size, scaled from its top-left corner
  // and moved by (x, y) px — kept so the picture always covers the view.
  const [view, setView] = useState(HOME);
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const lastTap = useRef(0);
  const [ownLine, setOwnLine] = useState(null);
  const [draftStroke, setDraftStroke] = useState(null); // fog being painted
  const [draftMark, setDraftMark] = useState(null); // a mark being placed

  function clampView(v) {
    const el = viewportRef.current;
    const w = el?.clientWidth || 0;
    const h = el?.clientHeight || 0;
    const z = Math.min(MAX_ZOOM, Math.max(1, v.z));
    return { z, x: Math.min(0, Math.max(w * (1 - z), v.x)), y: Math.min(0, Math.max(h * (1 - z), v.y)) };
  }

  // Zoom to `z` keeping the point under (px, py) — viewport coordinates — still.
  function zoomAt(base, z, px, py) {
    const wx = (px - base.x) / base.z;
    const wy = (py - base.y) / base.z;
    return clampView({ z, x: px - wx * z, y: py - wy * z });
  }

  function local(event) {
    const rect = viewportRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    // Non-passive so a trackpad pinch (ctrl + wheel) zooms the scene, not the page.
    const onWheel = (event) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015));
      setView((v) => zoomAt(v, v.z * factor, event.clientX - rect.left, event.clientY - rect.top));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // zoomAt only reads the viewport's size, which it looks up each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new picture starts from the whole view.
  const [shownArt, setShownArt] = useState(artPath);
  if (shownArt !== artPath) {
    setShownArt(artPath);
    setView(HOME);
  }

  function spotFor(event) {
    const rect = stageRef.current.getBoundingClientRect();
    return {
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height),
    };
  }

  function round3(spot) {
    return { x: Math.round(spot.x * 1000) / 1000, y: Math.round(spot.y * 1000) / 1000 };
  }

  function startPinch() {
    const [a, b] = [...pointers.current.values()];
    gesture.current = {
      type: 'pinch',
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      base: viewRef.current,
    };
  }

  function onViewportDown(event) {
    if (event.target.closest('.scene-token, .scene-zoom-reset, .scene-marker, .scene-area-label') || event.button > 0) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* the pointer already went away — nothing to capture */
    }
    pointers.current.set(event.pointerId, local(event));
    if (pointers.current.size === 2) {
      if (gesture.current?.type === 'measure') setOwnLine(null);
      startPinch();
    } else if (pointers.current.size === 1) {
      const p = local(event);
      const spot = spotFor(event);
      if (mapTool?.type === 'fog') {
        const pts = [Math.round(spot.x * 1000), Math.round(spot.y * 1000)];
        gesture.current = { type: 'paint', start: p, moved: true, stroke: { m: mapTool.mode, w: mapTool.width, p: pts } };
        setDraftStroke(gesture.current.stroke);
        return;
      }
      if (mapTool?.type === 'place') {
        const draft = { ...mapTool.preset, ...round3(spot), angle: -90 };
        gesture.current = { type: 'place', start: p, moved: true, draft };
        setDraftMark(draft);
        return;
      }
      gesture.current = measuring
        ? { type: 'measure', from: round3(spot), start: p, moved: false }
        : { type: 'pan', start: p, base: viewRef.current, moved: false, spot };
      window.clearTimeout(holdTimer.current);
      if (!measuring && onPing) {
        holdTimer.current = window.setTimeout(() => {
          const g = gesture.current;
          if (g?.type === 'pan' && !g.moved) {
            g.pinged = true;
            onPing(round3(g.spot));
          }
        }, PING_HOLD_MS);
      }
    } else {
      window.clearTimeout(holdTimer.current);
    }
  }

  function onViewportMove(event) {
    if (!pointers.current.has(event.pointerId)) return;
    const p = local(event);
    pointers.current.set(event.pointerId, p);
    const g = gesture.current;
    if (!g) return;
    if (g.type === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const z = g.base.z * (dist / g.dist);
      const wx = (g.mid.x - g.base.x) / g.base.z;
      const wy = (g.mid.y - g.base.y) / g.base.z;
      setView(clampView({ z, x: mid.x - wx * z, y: mid.y - wy * z }));
      return;
    }
    if (g.type === 'paint') {
      const spot = spotFor(event);
      const x = Math.round(spot.x * 1000);
      const y = Math.round(spot.y * 1000);
      const pts = g.stroke.p;
      if (Math.hypot(x - pts[pts.length - 2], y - pts[pts.length - 1]) < 6) return;
      g.stroke = { ...g.stroke, p: [...pts, x, y] };
      setDraftStroke(g.stroke);
      return;
    }
    if (g.type === 'place') {
      if (!isAimed(g.draft.kind)) return;
      const spot = spotFor(event);
      const dx = spot.x - g.draft.x;
      const dy = (spot.y - g.draft.y) / aspect;
      if (Math.hypot(dx, dy) < 0.01) return;
      g.draft = { ...g.draft, angle: Math.round((Math.atan2(dy, dx) * 180) / Math.PI) };
      setDraftMark(g.draft);
      return;
    }
    if (!g.moved && Math.hypot(p.x - g.start.x, p.y - g.start.y) < DRAG_START_PX) return;
    g.moved = true;
    window.clearTimeout(holdTimer.current);
    if (g.type === 'pan') {
      setView(clampView({ z: g.base.z, x: g.base.x + p.x - g.start.x, y: g.base.y + p.y - g.start.y }));
    } else if (g.type === 'measure') {
      const line = { from: g.from, to: round3(spotFor(event)) };
      setOwnLine(line);
      onMeasure?.(line);
    }
  }

  function onViewportUp(event) {
    if (!pointers.current.delete(event.pointerId)) return;
    window.clearTimeout(holdTimer.current);
    const g = gesture.current;
    if (g?.type === 'pinch') {
      // One finger left after a pinch carries on as a pan, never a tap.
      const [rest] = [...pointers.current.values()];
      gesture.current = rest ? { type: 'pan', start: rest, base: viewRef.current, moved: true } : null;
      return;
    }
    gesture.current = null;
    if (g?.type === 'paint') {
      setDraftStroke(null);
      onPaint?.(g.stroke);
      return;
    }
    if (g?.type === 'place') {
      setDraftMark(null);
      onPlaceMark?.({ x: g.draft.x, y: g.draft.y, angle: g.draft.angle });
      return;
    }
    if (g?.type === 'measure' && g.moved) {
      // The line lingers a moment so the table can read it, then goes.
      window.setTimeout(() => {
        setOwnLine(null);
        onMeasure?.(null);
      }, 1500);
      return;
    }
    if (g && !g.moved && !g.pinged) {
      const now = Date.now();
      if (now - lastTap.current < DOUBLE_TAP_MS && viewRef.current.z > 1) setView(HOME);
      lastTap.current = now;
      onBackground(round3(g.spot));
    }
  }

  // ---- Tokens -------------------------------------------------------------
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
    const spot = snapToGrid(round3(spotFor(event)), grid, aspect, token.size || 1);
    setDragPos(null);
    onMove(token.key, spot.x, spot.y);
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

  function renderToken(token) {
    // A picked group follows whichever of them is being dragged.
    const leader = dragPos && tokens.find((t) => t.key === dragPos.key);
    const follows = leader && token.key !== leader.key && picked?.has(leader.key) && picked.has(token.key);
    const pos =
      dragPos?.key === token.key
        ? dragPos
        : follows
          ? { x: clamp01(token.x + dragPos.x - leader.x), y: clamp01(token.y + dragPos.y - leader.y) }
          : token;
    const active = moments[token.key] || [];
    const classes = [
      'scene-token',
      `scene-token-${token.kind}`,
      token.isCurrent && 'current',
      token.down && 'down',
      token.hidden && 'off-scene',
      token.mine && 'mine',
      token.dmOnly && 'dm-only',
      picked?.has(token.key) && 'picked',
      token.draggable && 'draggable',
      selectedKey === token.key && 'selected',
      (dragPos?.key === token.key || follows) && 'dragging',
      ...active.map((m) => `moment-${m.kind}`),
    ]
      .filter(Boolean)
      .join(' ');
    return (
      <button
        key={token.key}
        type="button"
        className={classes}
        style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%`, '--size': token.size || 1 }}
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
  }

  const line = ownLine || measure;
  const feet = line && grid ? measureFeet(grid, aspect, line.from, line.to) : null;
  const tall = 1000 / aspect;

  return (
    <div
      ref={viewportRef}
      className={`scene-viewport${measuring || mapTool ? ' measuring tooling' : ''}`}
      onPointerDown={onViewportDown}
      onPointerMove={onViewportMove}
      onPointerUp={onViewportUp}
      onPointerCancel={onViewportUp}
    >
      <div
        className="scene-zoom"
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`,
          '--token-scale': view.z ** -0.6,
        }}
      >
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
          <SceneMood mood={mood} layer="under" aspect={aspect} lights={lights} isDM={isDM} />
          {grid && (
            <div
              className="scene-grid"
              aria-hidden="true"
              style={{ backgroundSize: `${grid.size * 100}% ${grid.size * aspect * 100}%` }}
            />
          )}
          {line && (
            <svg className="scene-measure" viewBox={`0 0 1000 ${tall}`} preserveAspectRatio="none" aria-hidden="true">
              <line x1={line.from.x * 1000} y1={line.from.y * tall} x2={line.to.x * 1000} y2={line.to.y * tall} />
              <circle cx={line.from.x * 1000} cy={line.from.y * tall} r="6" />
            </svg>
          )}
          {line && feet != null && (
            <span
              className="scene-measure-label"
              style={{ left: `${((line.from.x + line.to.x) / 2) * 100}%`, top: `${((line.from.y + line.to.y) / 2) * 100}%` }}
            >
              {feet} ft
            </span>
          )}
          {(pings || []).map((p) => (
            <span key={p.id} className="scene-ping" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }} aria-hidden="true" />
          ))}
          {marks && <SceneAreas marks={marks} draft={draftMark && ['circle', 'square', 'cone', 'line'].includes(draftMark.kind) ? draftMark : null} grid={grid} aspect={aspect} />}
          {tokens.filter((t) => t.kind !== 'pc').map(renderToken)}
          {marks && <AreaLabels marks={marks} grid={grid} aspect={aspect} onTap={onMarkTap} />}
          {marks && <SceneMarkers marks={draftMark && !['circle', 'square', 'cone', 'line'].includes(draftMark.kind) ? [...marks, { ...draftMark, id: 'draft' }] : marks} onTap={onMarkTap} showInfo={showInfo} />}
          {fog && <SceneFog fog={fog} draft={draftStroke} aspect={aspect} isDM={isDM} />}
          {tokens.filter((t) => t.kind === 'pc').map(renderToken)}
          <SceneMood mood={mood} layer="over" aspect={aspect} lights={lights} isDM={isDM} />
        </div>
      </div>
      {showInfo && view.z > 1 && (
        <button type="button" className="scene-zoom-reset" onClick={() => setView(HOME)}>
          Whole scene
        </button>
      )}
    </div>
  );
}
