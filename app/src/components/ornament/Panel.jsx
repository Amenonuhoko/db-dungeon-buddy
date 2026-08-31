// Shared "engraved panel" surface — see BIBLE.md §3. `corners` adds the
// Warframe-style bracket ornament for the currently-focused/primary panel
// on a screen; leave it off for secondary/nested panels to keep it a
// signal, not wallpaper.
export function Panel({ corners = false, className = '', style, children }) {
  const classes = ['panel', corners ? 'corner-frame' : '', className].filter(Boolean).join(' ');
  return (
    <div className={classes} style={style}>
      {children}
    </div>
  );
}
