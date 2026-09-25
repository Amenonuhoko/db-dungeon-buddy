import { useState } from 'react';
import { COINS } from '../lib/stash.js';

// The character's own belongings (011): an item list — quantity, a note,
// whether it's equipped — and a personal coin purse, separate from the
// party's shared stash. Edited in place: every change is saved straight
// away through onPatch({ inventory } / { coins }). Private to the
// character's player and the DM (010).
const EMPTY_COINS = { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };

export function SheetInventory({ sheet, editable, onPatch }) {
  const items = Array.isArray(sheet.inventory) ? sheet.inventory : [];
  const coins = { ...EMPTY_COINS, ...(sheet.coins || {}) };
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);

  const saveItems = (next) => onPatch({ inventory: next });

  function add(event) {
    event.preventDefault();
    if (!name.trim()) return;
    saveItems([...items, { name: name.trim().slice(0, 120), qty: Math.max(1, Number(qty) || 1), note: '', equipped: false }]);
    setName('');
    setQty(1);
  }

  function change(index, patch) {
    saveItems(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function setCoin(key, raw) {
    const value = Math.max(0, Math.floor(Number(raw) || 0));
    if (value !== coins[key]) onPatch({ coins: { ...coins, [key]: value } });
  }

  if (!editable && items.length === 0 && Object.values(coins).every((v) => !v)) return null;

  return (
    <div className="sheet-inventory">
      <label className="character-sheet-section-label">Inventory</label>

      <div className="sheet-coins" aria-label="Coins">
        {COINS.map((c) => (
          <label key={c.key} className={`sheet-coin coin-${c.key}`}>
            {editable ? (
              <input
                type="number"
                min="0"
                inputMode="numeric"
                defaultValue={coins[c.key]}
                key={`${c.key}-${coins[c.key]}`}
                onBlur={(e) => setCoin(c.key, e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                aria-label={`${c.label} pieces`}
              />
            ) : (
              <span className="coin-amount">{coins[c.key].toLocaleString()}</span>
            )}
            <span className="coin-label">{c.key}</span>
          </label>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="hint-text" style={{ margin: '0.4rem 0' }}>
          {editable ? 'Nothing carried yet — add items below.' : 'Carrying nothing.'}
        </p>
      ) : (
        <ul className="sheet-items">
          {items.map((item, index) => (
            <li key={`${item.name}-${index}`} className={`sheet-item${item.equipped ? ' equipped' : ''}`}>
              <div className="sheet-item-main">
                <span className="sheet-item-name">
                  {item.name}
                  {item.equipped && <span className="chip chip-small">Equipped</span>}
                </span>
                {editable ? (
                  <input
                    className="sheet-item-note"
                    defaultValue={item.note || ''}
                    key={`note-${index}-${item.note || ''}`}
                    placeholder="Note"
                    maxLength={200}
                    onBlur={(e) => e.target.value.trim() !== (item.note || '') && change(index, { note: e.target.value.trim() })}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    aria-label={`Note for ${item.name}`}
                  />
                ) : (
                  item.note && <span className="sheet-item-note-text">{item.note}</span>
                )}
              </div>
              {editable ? (
                <div className="sheet-item-controls">
                  <div className="stash-qty" role="group" aria-label={`Quantity of ${item.name}`}>
                    <button type="button" onClick={() => change(index, { qty: (item.qty || 1) - 1 })} disabled={(item.qty || 1) <= 1} aria-label="One fewer">
                      −
                    </button>
                    <span>×{item.qty || 1}</span>
                    <button type="button" onClick={() => change(index, { qty: (item.qty || 1) + 1 })} aria-label="One more">
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    className={`btn btn-small ${item.equipped ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => change(index, { equipped: !item.equipped })}
                    aria-pressed={Boolean(item.equipped)}
                  >
                    {item.equipped ? 'Unequip' : 'Equip'}
                  </button>
                  <button type="button" className="condition-chip-remove" onClick={() => saveItems(items.filter((_, i) => i !== index))} aria-label={`Remove ${item.name}`}>
                    ×
                  </button>
                </div>
              ) : (
                <span className="stash-qty">×{item.qty || 1}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <form className="sheet-item-add" onSubmit={add}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add an item — Potion of Healing" maxLength={120} aria-label="New item" />
          <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Quantity" className="sheet-item-qty" />
          <button type="submit" className="btn btn-ghost btn-small" disabled={!name.trim()}>
            Add
          </button>
        </form>
      )}
    </div>
  );
}
