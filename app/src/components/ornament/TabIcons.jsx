// Simple stroke-based icons for the bottom tab dock — currentColor so
// they follow the active/inactive text color automatically, no separate
// fill logic needed. Kept in the same free-flowing line quality as the
// rest of the ornament vocabulary (curves, not boxes).
const common = { viewBox: '0 0 24 24', width: 22, height: 22, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };

export function BookIcon() {
  return (
    <svg {...common} aria-hidden="true">
      <path d="M12 6.5 C10 5 6.5 4.5 4 5 V18 C6.5 17.5 10 18 12 19.5" />
      <path d="M12 6.5 C14 5 17.5 4.5 20 5 V18 C17.5 17.5 14 18 12 19.5" />
      <path d="M12 6.5 V19.5" />
    </svg>
  );
}

export function QuillIcon() {
  return (
    <svg {...common} aria-hidden="true">
      <path d="M19 5 C13 6 7 11 5 19 C10.5 17.5 16 13 19 5 Z" />
      <path d="M9.5 14.5 C7.8 16 6.3 17.6 5 19" />
    </svg>
  );
}

export function PawIcon() {
  return (
    <svg {...common} aria-hidden="true">
      <path d="M12 13.5 C9 13.5 6.8 16.2 7.2 18.4 C7.5 19.9 9 20.5 10.5 19.9 C11.4 19.5 12.6 19.5 13.5 19.9 C15 20.5 16.5 19.9 16.8 18.4 C17.2 16.2 15 13.5 12 13.5 Z" />
      <ellipse cx="7" cy="9.5" rx="1.7" ry="2.2" />
      <ellipse cx="11" cy="7.5" rx="1.7" ry="2.3" />
      <ellipse cx="15" cy="7.5" rx="1.7" ry="2.3" />
      <ellipse cx="17.5" cy="10" rx="1.6" ry="2.1" />
    </svg>
  );
}

export function ShieldIcon() {
  return (
    <svg {...common} aria-hidden="true">
      <path d="M12 4 L19 6.5 V12 C19 16 16 18.8 12 20 C8 18.8 5 16 5 12 V6.5 Z" />
      <path d="M9 11.5 L11 13.5 L15.5 9" />
    </svg>
  );
}
