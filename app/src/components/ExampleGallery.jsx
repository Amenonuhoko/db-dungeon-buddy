import { useEffect, useState } from 'react';
import { Panel } from './ornament/Panel.jsx';

// Shows reference samples for a content type — clearly marked as samples
// (dashed border, "Example" chip — see .panel-sample/.chip-sample), never
// mixed into the real list, and never editable/deletable since they
// aren't stored anywhere. "Use as Template" hands the example's fields to
// the caller, which opens the create form pre-filled with them — the
// fastest way from "blank page" to "something to edit" for a new DM.
//
// Expanded by default when the real list is empty (nothing to show
// otherwise), collapsed once there's real content so it doesn't compete
// with it.
export function ExampleGallery({ items, isEmpty, renderItem, onUseTemplate }) {
  const [open, setOpen] = useState(isEmpty);

  // Auto-collapse the moment the list goes from empty to non-empty (i.e.
  // right after saving the first real entry) — the exact point the
  // samples stop being needed as guidance. Never re-fires after that, so
  // it never fights a later manual toggle.
  useEffect(() => {
    if (!isEmpty) setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmpty]);

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <button type="button" className="btn btn-ghost btn-small" onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide Examples' : `Show Examples (${items.length})`}
      </button>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
          <p className="hint-text">Samples for reference only — not part of your campaign.</p>
          {items.map((item, i) => (
            <Panel key={i} className="panel-sample">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem' }}>
                <span className="chip-sample">Example</span>
                <button className="btn btn-ghost btn-small" type="button" onClick={() => onUseTemplate(item)}>
                  Use as Template
                </button>
              </div>
              <div style={{ marginTop: '0.75rem' }}>{renderItem(item)}</div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
