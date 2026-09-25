import { CLASSES, RACES } from '../lib/characters.js';

// The quick "new character" fields — name, class + level, race, max HP,
// AC — shared by every place a character gets made: the Party tab, the
// "Choose your character" step after joining, and My Characters on the
// hub. Class and race are dropdowns with an "Other…" escape hatch;
// finalizeQuickFields() (lib/characters.js) turns `form` + `picks` into
// the stored fields. extraClasses / extraRaces are custom ones already
// used in this campaign or My Characters (customOptions()), offered in
// the list so nobody retypes "Artificer" for every character. The parent owns the state so it can prefill from a
// template and add its own fields around these. The guided builder
// (CharacterBuilder.jsx) passes vitals={false} — it works out HP and AC
// itself, later.
export function QuickCharacterFields({ form, setForm, picks, setPicks, extraClasses = [], extraRaces = [], vitals = true }) {
  return (
    <>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div className="field" style={{ flex: '2 1 200px' }}>
          <label htmlFor="charName">Character name</label>
          <input
            id="charName"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Mira Duskwalker"
            maxLength={120}
            autoFocus
          />
        </div>
        <div className="field" style={{ flex: '2 1 160px' }}>
          <label htmlFor="charClass">Class</label>
          <select
            id="charClass"
            value={picks.classChoice}
            onChange={(e) => setPicks({ ...picks, classChoice: e.target.value })}
          >
            <option value="">Choose a class…</option>
            {CLASSES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            {extraClasses.length > 0 && (
              <optgroup label="Used in your games">
                {extraClasses.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </optgroup>
            )}
            <option value="Other">Other…</option>
          </select>
        </div>
        <div className="field" style={{ flex: '1 1 90px' }}>
          <label htmlFor="charLevel">Level</label>
          <input
            id="charLevel"
            type="number"
            min="1"
            max="20"
            value={picks.level}
            onChange={(e) => setPicks({ ...picks, level: e.target.value })}
            placeholder="1"
          />
        </div>
      </div>

      {picks.classChoice === 'Other' && (
        <div className="field">
          <label htmlFor="charClassCustom">Custom class</label>
          <input
            id="charClassCustom"
            value={picks.customClass}
            onChange={(e) => setPicks({ ...picks, customClass: e.target.value })}
            placeholder="Artificer"
            autoFocus
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div className="field" style={{ flex: '2 1 160px' }}>
          <label htmlFor="charRace">Race / Species</label>
          <select
            id="charRace"
            value={picks.raceChoice}
            onChange={(e) => setPicks({ ...picks, raceChoice: e.target.value })}
          >
            <option value="">Choose a race…</option>
            {RACES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
            {extraRaces.length > 0 && (
              <optgroup label="Used in your games">
                {extraRaces.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </optgroup>
            )}
            <option value="Other">Other…</option>
          </select>
        </div>
        {vitals && (
          <>
            <div className="field" style={{ flex: '1 1 90px' }}>
              <label htmlFor="charMaxHp">Max HP</label>
              <input id="charMaxHp" type="number" min="0" value={form.maxHp} onChange={(e) => setForm({ ...form, maxHp: e.target.value })} />
            </div>
            <div className="field" style={{ flex: '1 1 90px' }}>
              <label htmlFor="charAC">Armor Class</label>
              <input id="charAC" type="number" value={form.armorClass} onChange={(e) => setForm({ ...form, armorClass: e.target.value })} />
            </div>
          </>
        )}
      </div>

      {picks.raceChoice === 'Other' && (
        <div className="field">
          <label htmlFor="charRaceCustom">Custom race / species</label>
          <input
            id="charRaceCustom"
            value={picks.customRace}
            onChange={(e) => setPicks({ ...picks, customRace: e.target.value })}
            placeholder="Tabaxi"
          />
        </div>
      )}
    </>
  );
}
