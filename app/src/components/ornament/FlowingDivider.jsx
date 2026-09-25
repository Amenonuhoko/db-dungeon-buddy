// The divider under headings — a stitched leather seam (the mascot's
// tome straps) with a tiny d20 at its center, the app's one mark. Kept
// the FlowingDivider name so every existing usage picks it up unchanged.
export function FlowingDivider() {
  return (
    <div className="seam" role="presentation" aria-hidden="true">
      <span className="seam-line" />
      <svg viewBox="0 0 24 24" width="22" height="22" className="seam-die">
        <path d="M12 2 L21 7 V17 L12 22 L3 17 V7 Z" fill="var(--die-fill)" stroke="var(--die-edge)" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M12 6.5 L17 15 H7 Z" fill="none" stroke="var(--die-numeral)" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
      <span className="seam-line" />
    </div>
  );
}
