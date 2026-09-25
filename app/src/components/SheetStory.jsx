import { useState } from 'react';

// Who the character is, not just what they can do (011): the four
// personality prompts from the paper sheet and a backstory. Private to
// the character's player and the DM, like the rest of the sheet's
// details (010). Edited through the sheet's "Edit Sheet" form.
const PROMPTS = [
  ['personalityTraits', 'Personality traits'],
  ['ideals', 'Ideals'],
  ['bonds', 'Bonds'],
  ['flaws', 'Flaws'],
];
const PREVIEW_CHARS = 420;

export function SheetStory({ sheet, editable }) {
  const [expanded, setExpanded] = useState(false);
  const filled = PROMPTS.filter(([key]) => sheet[key]?.trim());
  const backstory = sheet.backstory?.trim() || '';
  if (!filled.length && !backstory) {
    return editable ? (
      <p className="hint-text sheet-story-empty">
        Personality and backstory are empty — add them with Edit Sheet.
      </p>
    ) : null;
  }
  const long = backstory.length > PREVIEW_CHARS;
  return (
    <div className="sheet-story">
      {filled.length > 0 && (
        <div className="sheet-personality">
          {filled.map(([key, label]) => (
            <div key={key} className="sheet-personality-item">
              <h4>{label}</h4>
              <p>{sheet[key].trim()}</p>
            </div>
          ))}
        </div>
      )}
      {backstory && (
        <div className="character-sheet-scroll sheet-backstory">
          <h3>Backstory</h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>{long && !expanded ? `${backstory.slice(0, PREVIEW_CHARS).trimEnd()}…` : backstory}</p>
          {long && (
            <button type="button" className="example-toggle" onClick={() => setExpanded((e) => !e)}>
              {expanded ? 'Show less' : 'Read the whole story'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
