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
