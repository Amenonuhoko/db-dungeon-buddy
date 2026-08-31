import { GreekKeyRule } from './GreekKeyRule.jsx';

// Shared "engraved panel" surface — see BIBLE.md §3. `corners` adds the
// Warframe-style bracket ornament for the currently-focused/primary panel
// on a screen; `topRule` adds a thin Greek-key strip across the top, a
// small deliberate dose of the angular "tech" half of the theme against
// the otherwise free-flowing vine ornament. Use both sparingly — they're
// a signal for the primary panel on a screen, not wallpaper.
export function Panel({ corners = false, topRule = false, className = '', style, children }) {
  const classes = ['panel', corners ? 'corner-frame' : '', className].filter(Boolean).join(' ');
  return (
    <div className={classes} style={style}>
      {topRule && (
        <div className="panel-top-rule">
          <GreekKeyRule height={8} />
        </div>
      )}
      {children}
    </div>
  );
}
