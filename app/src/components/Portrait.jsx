import { useEffect, useRef, useState } from 'react';
import { hueFor, initials } from '../lib/avatar.js';
import { cropSquare, drawCrop, loadImageFile, usePortraitSrc } from '../lib/portraits.js';

// A character's portrait in a round brass-rimmed frame (014), or their
// initials on a colour of their own while there's no picture (or it's
// still loading, or the backend has no portraits yet). size: 'sm' for
// lists, 'md' for cards, 'lg' for the sheet.
export function Portrait({ path, name, size = 'md', className = '' }) {
  const src = usePortraitSrc(path);
  const [failed, setFailed] = useState(null);
  const show = src && failed !== src;
  return (
    <span
      className={`portrait portrait-${size}${show ? '' : ' portrait-empty'} ${className}`}
      style={show ? undefined : { '--portrait-hue': hueFor(name) }}
      aria-hidden="true"
    >
      {show ? <img src={src} alt="" loading="lazy" onError={() => setFailed(src)} /> : <span>{initials(name)}</span>}
    </span>
  );
}

// The portrait with a way to change it: pick a picture, drag it into
// place and zoom, save. onSave(img, crop) does the storing (lib/
// characters.js saveSheetPortrait, lib/roster.js saveRosterPortrait) and
// may throw; the message it throws is shown here.
const PREVIEW = 240;

export function PortraitPicker({ path, name, onSave, onRemove, describeError = (e) => e.message, size = 'lg' }) {
  const [img, setImg] = useState(null);
  const [crop, setCrop] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);
  const canvasRef = useRef(null);
  const drag = useRef(null);

  useEffect(() => {
    if (img && crop && canvasRef.current) drawCrop(canvasRef.current, img, crop, PREVIEW * 2);
  }, [img, crop]);

  async function choose(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const loaded = await loadImageFile(file);
      setImg(loaded);
      setCrop({ zoom: 1, cx: loaded.naturalWidth / 2, cy: loaded.naturalHeight / 2 });
    } catch (err) {
      setError(err.message);
    }
  }

  // Moving the picture by (dx, dy) on screen moves the crop the other way.
  function pan(dx, dy) {
    setCrop((c) => {
      const { side, cx, cy } = cropSquare(img, c);
      const scale = side / PREVIEW;
      const next = cropSquare(img, { ...c, cx: cx - dx * scale, cy: cy - dy * scale });
      return { ...c, cx: next.cx, cy: next.cy };
    });
  }

  function onPointerDown(event) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY };
  }

  function onPointerMove(event) {
    if (!drag.current) return;
    pan(event.clientX - drag.current.x, event.clientY - drag.current.y);
    drag.current = { x: event.clientX, y: event.clientY };
  }

  function onKeyDown(event) {
    const step = PREVIEW / 20;
    const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (!moves[event.key]) return;
    event.preventDefault();
    pan(...moves[event.key]);
  }

  function setZoom(zoom) {
    setCrop((c) => {
      const next = cropSquare(img, { ...c, zoom });
      return { zoom, cx: next.cx, cy: next.cy };
    });
  }

  async function run(action) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setImg(null);
      setCrop(null);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="portrait-picker">
      {img ? (
        <div className="portrait-cropper">
          <canvas
            ref={canvasRef}
            className="portrait-crop-canvas"
            style={{ width: PREVIEW, height: PREVIEW }}
            tabIndex={0}
            role="img"
            aria-label="Portrait preview — drag or use the arrow keys to move it"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            onKeyDown={onKeyDown}
          />
          <label className="portrait-zoom">
            <span>Zoom</span>
            <input type="range" min="1" max="4" step="0.01" value={crop.zoom} onChange={(e) => setZoom(Number(e.target.value))} />
          </label>
          <p className="hint-text" style={{ margin: 0 }}>
            Drag to line it up.
          </p>
          <div className="portrait-actions">
            <button type="button" className="btn btn-primary btn-small" disabled={busy} onClick={() => run(() => onSave(img, crop))}>
              {busy ? 'Saving…' : 'Save Portrait'}
            </button>
            <button type="button" className="btn btn-ghost btn-small" disabled={busy} onClick={() => setImg(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="portrait-button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            aria-label={path ? `Change ${name}'s portrait` : `Add a portrait for ${name}`}
          >
            <Portrait path={path} name={name} size={size} />
            <span className="portrait-button-label">{path ? 'Change' : '+ Portrait'}</span>
          </button>
          {path && onRemove && (
            <button type="button" className="example-toggle portrait-remove" disabled={busy} onClick={() => run(onRemove)}>
              Remove portrait
            </button>
          )}
        </>
      )}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={choose} />
      {error && <p className="error-text portrait-error">{error}</p>}
    </div>
  );
}
