import { PanelCrest } from './PanelCrest.jsx';

// Shared "engraved panel" surface — see BIBLE.md §3. `corners` adds the
// Warframe-style bracket ornament for the currently-focused/primary panel
// on a screen; `topRule` adds a small heraldic crest across the top
// (PanelCrest — end studs, tapering rules, laurel sprigs, a center gem).
// Use both sparingly — they're a signal for the primary panel on a
// screen, not wallpaper.
export function Panel({ corners = false, topRule = false, className = '', style, children }) {
  const classes = ['panel', corners ? 'corner-frame' : '', className].filter(Boolean).join(' ');
  return (
    <div className={classes} style={style}>
      {topRule && (
        <div className="panel-top-rule">
          <PanelCrest height={20} />
        </div>
      )}
      {children}
    </div>
  );
}
