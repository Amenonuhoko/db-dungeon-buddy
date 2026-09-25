import { PanelCrest } from './PanelCrest.jsx';

// Shared sticker-card surface — see BIBLE.md §3. `corners` gives it brass
// trim (the primary/focused panel on a screen); `topRule` adds the tome's
// bookmark ribbons peeking over the top edge (PanelCrest). Use both
// sparingly — they mark the primary panel on a screen, not wallpaper.
export function Panel({ corners = false, topRule = false, className = '', style, children }) {
  const classes = ['panel', corners ? 'corner-frame' : '', className].filter(Boolean).join(' ');
  return (
    <div className={classes} style={style}>
      {topRule && (
        <div className="panel-top-rule">
          <PanelCrest />
        </div>
      )}
      {children}
    </div>
  );
}
