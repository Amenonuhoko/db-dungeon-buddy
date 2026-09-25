// Small stroke icons for toolbar actions — same currentColor/rounded-line
// style as TabIcons.jsx, just sized for inline buttons rather than the
// bottom dock.
const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };

export function DownloadIcon(props) {
  return (
    <svg {...common} width={16} height={16} aria-hidden="true" {...props}>
      <path d="M12 4 V15" />
      <path d="M7 11 L12 16 L17 11" />
      <path d="M5 19 H19" />
    </svg>
  );
}

export function UploadIcon(props) {
  return (
    <svg {...common} width={16} height={16} aria-hidden="true" {...props}>
      <path d="M12 16 V5" />
      <path d="M7 9 L12 4 L17 9" />
      <path d="M5 19 H19" />
    </svg>
  );
}

export function ChevronIcon(props) {
  return (
    <svg {...common} width={12} height={12} aria-hidden="true" {...props}>
      <path d="M6 9 L12 15 L18 9" />
    </svg>
  );
}

export function GearIcon(props) {
  return (
    <svg {...common} width={16} height={16} aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </svg>
  );
}
