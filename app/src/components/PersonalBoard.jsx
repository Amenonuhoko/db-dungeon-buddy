import { useCallback, useEffect, useRef, useState } from 'react';
import { BOARD_HEIGHT, BOARD_MAX_BYTES, BOARD_WIDTH, boardMissing, loadBoard, saveBoard } from '../lib/board.js';
import { ConfirmButton } from './ConfirmButton.jsx';

// A private sketch board (013) — dungeon maps, the villain's face, a
// clue's shape. Deliberately simple: a pen in a few colours, two widths,
// an eraser, undo and clear, saved automatically a moment after you stop
// drawing. Only its owner ever sees it — not the party, not the DM.
//
// Colours are stored by name and resolved from the theme's tokens when
// drawn, so a board reads right in both light and dark mode.
const COLOURS = [
  { key: 'ink', label: 'Ink', token: '--text' },
  { key: 'red', label: 'Red', token: '--accent' },
  { key: 'blue', label: 'Blue', token: '--bookmark-blue' },
  { key: 'green', label: 'Green', token: '--laurel' },
  { key: 'gold', label: 'Gold', token: '--gold' },
];
const WIDTHS = [
  { key: 3, label: 'Fine' },
  { key: 9, label: 'Bold' },
];
const ERASER_WIDTH = 28;
const SAVE_DELAY_MS = 800;
const MIN_STEP = 2; // board units between recorded points

function colourOf(key) {
  const token = (COLOURS.find((c) => c.key === key) || COLOURS[0]).token;
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || '#333';
}

function drawStroke(ctx, stroke, scale) {
  const p = stroke.p;
  if (!p || p.length < 2) return;
  ctx.globalCompositeOperation = stroke.e ? 'destination-out' : 'source-over';
  ctx.strokeStyle = stroke.e ? '#000' : colourOf(stroke.c);
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = stroke.w * scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (p.length === 2) {
    ctx.beginPath();
    ctx.arc(p[0] * scale, p[1] * scale, (stroke.w * scale) / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(p[0] * scale, p[1] * scale);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i] * scale, p[i + 1] * scale);
  ctx.stroke();
}

export function PersonalBoard({ status, campaignId, userId }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const current = useRef(null);
  const saveTimer = useRef(null);
  const [strokes, setStrokes] = useState(null); // null = loading
  const [colour, setColour] = useState('ink');
  const [width, setWidth] = useState(3);
  const [erasing, setErasing] = useState(false);
  const [saveState, setSaveState] = useState('saved'); // saved | pending | saving | error
  const [problem, setProblem] = useState(null);
  const [cssWidth, setCssWidth] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStrokes(null);
    loadBoard(status, campaignId, userId)
      .then((list) => !cancelled && setStrokes(list))
      .catch((err) => {
        if (cancelled) return;
        setProblem(
          boardMissing(err)
            ? 'Your board needs the latest database update — whoever runs the backend should run db/migrations/013_personal_boards.sql (see README).'
            : err.message,
        );
        setStrokes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [status, campaignId, userId]);

  // Fit the canvas to its column, and keep it crisp on high-DPI screens.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;
    const observer = new ResizeObserver(() => setCssWidth(wrap.clientWidth));
    observer.observe(wrap);
    setCssWidth(wrap.clientWidth);
    return () => observer.disconnect();
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !cssWidth || !strokes) return;
    const dpr = window.devicePixelRatio || 1;
    const cssHeight = (cssWidth * BOARD_HEIGHT) / BOARD_WIDTH;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.height = `${cssHeight}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    const scale = cssWidth / BOARD_WIDTH;
    for (const stroke of strokes) drawStroke(ctx, stroke, scale);
    if (current.current) drawStroke(ctx, current.current, scale);
    ctx.globalCompositeOperation = 'source-over';
  }, [cssWidth, strokes]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  // Re-colour when the theme flips.
  useEffect(() => {
    const observer = new MutationObserver(redraw);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, [redraw]);

  // Save a moment after the last change.
  const persist = useCallback(
    (next) => {
      window.clearTimeout(saveTimer.current);
      setSaveState('pending');
      saveTimer.current = window.setTimeout(async () => {
        setSaveState('saving');
        try {
          await saveBoard(status, campaignId, userId, next);
          setSaveState('saved');
        } catch (err) {
          setSaveState('error');
          setProblem(boardMissing(err) ? 'Saving needs db/migrations/013_personal_boards.sql run (see README).' : err.message);
        }
      }, SAVE_DELAY_MS);
    },
    [status, campaignId, userId],
  );

  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  function commit(next) {
    if (JSON.stringify(next).length > BOARD_MAX_BYTES) {
      setProblem('The board is full — clear it or erase some of it to keep drawing.');
      redraw();
      return;
    }
    setProblem(null);
    setStrokes(next);
    persist(next);
  }

  function point(event) {
    const rect = canvasRef.current.getBoundingClientRect();
    const scale = BOARD_WIDTH / rect.width;
    return [Math.round((event.clientX - rect.left) * scale), Math.round((event.clientY - rect.top) * scale)];
  }

  function onPointerDown(event) {
    if (!strokes) return;
    event.preventDefault();
    canvasRef.current.setPointerCapture(event.pointerId);
    const [x, y] = point(event);
    current.current = erasing ? { e: 1, w: ERASER_WIDTH, p: [x, y] } : { c: colour, w: width, p: [x, y] };
    redraw();
  }

  function onPointerMove(event) {
    const stroke = current.current;
    if (!stroke) return;
    const [x, y] = point(event);
    const p = stroke.p;
    if (Math.hypot(x - p[p.length - 2], y - p[p.length - 1]) < MIN_STEP) return;
    p.push(x, y);
    // Draw just the new segment rather than the whole board.
    const ctx = canvasRef.current.getContext('2d');
    const scale = cssWidth / BOARD_WIDTH;
    drawStroke(ctx, { ...stroke, p: p.slice(-4) }, scale);
    ctx.globalCompositeOperation = 'source-over';
  }

  function onPointerUp() {
    const stroke = current.current;
    current.current = null;
    if (stroke) commit([...strokes, stroke]);
  }

  const status$ = { saved: 'Saved', pending: 'Unsaved changes…', saving: 'Saving…', error: "Couldn't save" }[saveState];

  return (
    <div className="board">
      <div className="board-toolbar">
        <div className="board-swatches" role="group" aria-label="Pen colour">
          {COLOURS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`board-swatch${!erasing && colour === c.key ? ' active' : ''}`}
              style={{ '--swatch': `var(${c.token})` }}
              onClick={() => {
                setColour(c.key);
                setErasing(false);
              }}
              aria-label={c.label}
              aria-pressed={!erasing && colour === c.key}
            />
          ))}
        </div>
        <div className="board-tools" role="group" aria-label="Tools">
          {WIDTHS.map((w) => (
            <button
              key={w.key}
              type="button"
              className={`btn btn-small ${!erasing && width === w.key ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => {
                setWidth(w.key);
                setErasing(false);
              }}
            >
              {w.label}
            </button>
          ))}
          <button type="button" className={`btn btn-small ${erasing ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setErasing((e) => !e)} aria-pressed={erasing}>
            Eraser
          </button>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => commit(strokes.slice(0, -1))} disabled={!strokes?.length}>
            Undo
          </button>
          <ConfirmButton className="btn btn-ghost btn-small" confirmLabel="Clear it all?" onConfirm={() => commit([])} disabled={!strokes?.length}>
            Clear
          </ConfirmButton>
        </div>
      </div>

      <div ref={wrapRef} className="board-canvas-wrap">
        {strokes === null && <p className="hint-text board-loading">Opening your board…</p>}
        <canvas
          ref={canvasRef}
          className={`board-canvas${erasing ? ' erasing' : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-label="Your personal drawing board"
          role="img"
        />
      </div>

      <div className="board-footer">
        <span className="hint-text" style={{ margin: 0 }}>
          Only you can see this board — not the party, not the DM.
        </span>
        <span className={`board-save board-save-${saveState}`}>{status$}</span>
      </div>
      {problem && <p className="error-text">{problem}</p>}
    </div>
  );
}
