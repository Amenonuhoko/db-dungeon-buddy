// Small, self-dismissing notices at the top of a campaign — someone sat
// down at the table, stepped away, or sent you a message. Tapping one
// with an action (a message) takes you to it.
export function TableToasts({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;
  return (
    <div className="table-toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`table-toast table-toast-${t.kind}`}
          onClick={() => {
            t.onOpen?.();
            onDismiss(t.id);
          }}
        >
          <span className="table-toast-title">{t.title}</span>
          {t.body && <span className="table-toast-body">{t.body}</span>}
        </button>
      ))}
    </div>
  );
}
