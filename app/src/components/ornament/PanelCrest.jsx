// The top-of-panel ornament for a screen's primary panel (Panel's
// `topRule` prop): the three bookmark ribbons sticking out of the
// mascot's tome — blue, red, cream — peeking over the panel's top edge.
// Positioned by `.panel-top-rule` in index.css; purely decorative.
export function PanelCrest() {
  return (
    <>
      <span className="bookmark bookmark-blue" />
      <span className="bookmark bookmark-red" />
      <span className="bookmark bookmark-cream" />
    </>
  );
}
