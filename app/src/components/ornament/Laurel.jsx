// A single laurel branch; flip=true mirrors it for the opposite side of a
// heading. Used in pairs flanking titles, per BIBLE.md §3.
function Branch({ flip }) {
  const leaves = [0, 1, 2, 3, 4].map((i) => {
    const t = i / 4;
    const x = 4 + t * 30;
    const y = 14 - Math.sin(t * Math.PI) * 10;
    const angle = flip ? 200 - t * 40 : -20 + t * 40;
    return (
      <ellipse
        key={i}
        cx={x}
        cy={y}
        rx="6"
        ry="2.6"
        fill="var(--gold)"
        opacity={0.55 + t * 0.45}
        transform={`rotate(${angle} ${x} ${y})`}
      />
    );
  });
  return (
    <svg viewBox="0 0 40 20" width="60" height="30" role="presentation" aria-hidden="true">
      <path d="M2 16 Q20 4 36 12" fill="none" stroke="var(--gold-deep)" strokeWidth="1.5" />
      {leaves}
    </svg>
  );
}

export function LaurelFlourish({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'center' }}>
      <Branch />
      {children}
      <Branch flip />
    </div>
  );
}
