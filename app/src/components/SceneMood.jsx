import { useId } from 'react';

// The scene's atmosphere (lib/mood.js), drawn inside the stage so it pans
// and zooms with the picture. Tints and light sit under the tokens
// (`layer="under"`), weather falls in front of them (`layer="over"`).
// Torchlight and darkness are cut away around the party's tokens; the DM
// sees darkness at half strength so they can still run the map.
// Everything is CSS/SVG — no video — and holds still under
// prefers-reduced-motion (index.css).

const TORCH_R = 0.14;
const DARKVISION_R = 0.07;

export function SceneMood({ mood, layer, aspect, lights, isDM }) {
  const maskId = useId().replace(/:/g, '');
  if (layer === 'over') {
    return (
      <>
        {mood.weather && <div key={mood.weather} className={`mood mood-weather mood-${mood.weather}`} aria-hidden="true" />}
        {mood.magic === 'heartbeat' && <div className="mood mood-heartbeat" aria-hidden="true" />}
      </>
    );
  }

  const tall = 1000 / aspect;
  const dark = mood.light === 'torchlight' || mood.light === 'darkness';
  const radius = (mood.light === 'darkness' ? DARKVISION_R : TORCH_R) * 1000;

  return (
    <>
      {mood.time && <div key={mood.time} className={`mood mood-time mood-${mood.time}`} aria-hidden="true" />}
      {mood.magic && mood.magic !== 'heartbeat' && <div key={mood.magic} className={`mood mood-magic mood-${mood.magic}`} aria-hidden="true" />}
      {mood.light === 'firelight' && <div className="mood mood-firelight" aria-hidden="true" />}
      {dark && (
        <svg
          key={mood.light}
          className={`mood mood-dark${isDM ? ' mood-dark-dm' : ''}${mood.light === 'torchlight' ? ' mood-torch' : ''}`}
          viewBox={`0 0 1000 ${tall}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            {/* Solid holes blurred together, so two lights side by side
                merge instead of one's edge darkening the other. */}
            <filter id={`${maskId}-soft`} filterUnits="userSpaceOnUse" x="0" y="0" width="1000" height={tall}>
              <feGaussianBlur stdDeviation={radius * 0.3} />
            </filter>
            <mask id={`${maskId}-mask`}>
              <rect width="1000" height={tall} fill="#fff" />
              <g filter={`url(#${maskId}-soft)`}>
                {lights.map((l) => (
                  <circle key={l.key} cx={l.x * 1000} cy={l.y * tall} r={radius * 0.8} fill="#000" />
                ))}
              </g>
            </mask>
            <radialGradient id={`${maskId}-warm`}>
              <stop offset="0" stopColor="#ffb347" stopOpacity="0.35" />
              <stop offset="1" stopColor="#ff7a1a" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="1000" height={tall} fill="#050302" mask={`url(#${maskId}-mask)`} />
          {mood.light === 'torchlight' && (
            <g className="mood-torch-glow">
              {lights.map((l) => (
                <circle key={l.key} cx={l.x * 1000} cy={l.y * tall} r={radius * 1.1} fill={`url(#${maskId}-warm)`} />
              ))}
            </g>
          )}
        </svg>
      )}
    </>
  );
}
