import { useCallback, useEffect, useState } from 'react';
import { useCampaignLive } from '../lib/live.js';
import { isMissingTable } from '../lib/messages.js';
import { COINS, EMPTY_PURSE, addItem, adjustPurse, getPurse, listItems, purseInGold, removeItem, updateItem } from '../lib/stash.js';
import { DeleteButton } from './DeleteButton.jsx';

// The Party Stash — the coin purse and loot the party shares. Anyone at
// the table can add, spend, hand items around or remove them; changes
// show up on everyone's screen live (account mode). "Carried by" is free
// text with the party's character names suggested, because loot also
// ends up with mules, carts and NPCs.
export function PartyStash({ status, campaignId, characterNames }) {
  const [purse, setPurse] = useState(EMPTY_PURSE);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState(null);

  const [amount, setAmount] = useState('');
  const [coin, setCoin] = useState('gp');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', quantity: 1, carriedBy: '', note: '' });

  const load = useCallback(async () => {
    try {
      const [p, list] = await Promise.all([getPurse(status, campaignId), listItems(status, campaignId)]);
      setPurse(p);
      setItems(list);
      setUnavailable(false);
    } catch (err) {
      if (isMissingTable(err)) setUnavailable(true);
      else setError(err.message);
    }
  }, [status, campaignId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  useCampaignLive(status === 'authenticated', campaignId, ['party_items', 'party_coins'], load);

  async function run(action) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err.message);
    }
  }

  function moveCoins(sign) {
    const n = Math.floor(Number(amount));
    if (!n || n < 1) return;
    run(async () => {
      setPurse(await adjustPurse(status, campaignId, coin, sign * n));
      setAmount('');
    });
  }

  function submitItem(event) {
    event.preventDefault();
    if (!form.name.trim()) return;
    run(async () => {
      const created = await addItem(status, campaignId, form);
      setItems((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setForm({ name: '', quantity: 1, carriedBy: '', note: '' });
      setAdding(false);
    });
  }

  function patchItem(item, patch) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...patch } : i)));
    run(async () => {
      await updateItem(status, campaignId, item.id, patch);
    });
  }

  function deleteItem(item) {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    run(async () => {
      await removeItem(status, campaignId, item.id);
    });
  }

  if (unavailable) {
    return (
      <p className="hint-text">
        The Party Stash needs the latest database update — whoever runs the backend should run
        db/migrations/008_party.sql (see README).
      </p>
    );
  }

  const total = purseInGold(purse);
  const listId = `carriers-${campaignId}`;

  return (
    <div className="stash">
      {error && <p className="error-text">{error}</p>}

      <section className="stash-purse" aria-label="Party purse">
        <div className="stash-section-head">
          <h3>Coin purse</h3>
          <span className="stash-total">≈ {total.toLocaleString(undefined, { maximumFractionDigits: 2 })} gp</span>
        </div>
        <div className="coin-row">
          {COINS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`coin coin-${c.key}${coin === c.key ? ' selected' : ''}`}
              onClick={() => setCoin(c.key)}
              title={`${c.label} — tap to choose`}
              aria-pressed={coin === c.key}
            >
              <span className="coin-amount">{(purse[c.key] || 0).toLocaleString()}</span>
              <span className="coin-label">{c.key}</span>
            </button>
          ))}
        </div>
        <div className="coin-form">
          <input
            type="number"
            min="1"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            aria-label={`Amount of ${coin}`}
          />
          <span className="coin-form-unit">{coin}</span>
          <button type="button" className="btn btn-primary btn-small" onClick={() => moveCoins(1)} disabled={!amount}>
            Add
          </button>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => moveCoins(-1)} disabled={!amount}>
            Spend
          </button>
        </div>
      </section>

      <section className="stash-items" aria-label="Party loot">
        <div className="stash-section-head">
          <h3>Loot &amp; gear</h3>
          {!adding && (
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setAdding(true)}>
              + Add Item
            </button>
          )}
        </div>

        <datalist id={listId}>
          <option value="Party" />
          {characterNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>

        {adding && (
          <form className="stash-add" onSubmit={submitItem}>
            <div className="stash-add-row">
              <div className="field" style={{ flex: '3 1 160px' }}>
                <label htmlFor="stashName">Item</label>
                <input
                  id="stashName"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Potion of Healing"
                  maxLength={120}
                  autoFocus
                />
              </div>
              <div className="field" style={{ flex: '1 1 70px' }}>
                <label htmlFor="stashQty">Qty</label>
                <input id="stashQty" type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </div>
            </div>
            <div className="stash-add-row">
              <div className="field" style={{ flex: '1 1 140px' }}>
                <label htmlFor="stashCarrier">Carried by</label>
                <input
                  id="stashCarrier"
                  list={listId}
                  value={form.carriedBy}
                  onChange={(e) => setForm({ ...form, carriedBy: e.target.value })}
                  placeholder="Party"
                  maxLength={120}
                />
              </div>
              <div className="field" style={{ flex: '2 1 160px' }}>
                <label htmlFor="stashNote">Note</label>
                <input
                  id="stashNote"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="From the crypt — unidentified"
                  maxLength={500}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-primary btn-small" type="submit" disabled={!form.name.trim()}>
                Add to Stash
              </button>
              <button className="btn btn-ghost btn-small" type="button" onClick={() => setAdding(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {loading && <p className="hint-text">Opening the stash…</p>}
        {!loading && items.length === 0 && !adding && (
          <p className="hint-text">Nothing in the stash yet — add loot as the party finds it.</p>
        )}

        <ul className="stash-list">
          {items.map((item) => (
            <li key={item.id} className="stash-item panel">
              <DeleteButton onConfirm={() => deleteItem(item)} label={item.name} />
              <div className="stash-item-main">
                <span className="stash-item-name">{item.name}</span>
                {item.note && <span className="stash-item-note">{item.note}</span>}
              </div>
              <div className="stash-item-controls">
                <div className="stash-qty" role="group" aria-label={`Quantity of ${item.name}`}>
                  <button type="button" onClick={() => patchItem(item, { quantity: item.quantity - 1 })} disabled={item.quantity <= 1} aria-label="One fewer">
                    −
                  </button>
                  <span>×{item.quantity}</span>
                  <button type="button" onClick={() => patchItem(item, { quantity: item.quantity + 1 })} aria-label="One more">
                    +
                  </button>
                </div>
                <input
                  className="stash-carrier"
                  list={listId}
                  defaultValue={item.carriedBy}
                  key={item.carriedBy}
                  placeholder="Party"
                  aria-label={`Who carries ${item.name}`}
                  maxLength={120}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== item.carriedBy) patchItem(item, { carriedBy: v });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
