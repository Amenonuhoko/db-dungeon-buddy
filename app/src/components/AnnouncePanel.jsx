import { useState } from 'react';
import { PRESET_CALLS, PRESET_TITLES, readCustomCalls, writeCustomCalls } from '../lib/announce.js';

// The DM's Announce sheet: one tap sends a preset call to the table (or to
// one player), a title card sweeps across every screen, and a handout — a
// Lore entry or something written on the spot — lands in front of
// everyone as a card they read and put away. Everything sent also goes in
// the log.
export function AnnouncePanel({ campaignId, players, lore, handoutDraft, onSend }) {
  const [tab, setTab] = useState(handoutDraft ? 'handout' : 'call');
  const [to, setTo] = useState(null);
  const [custom, setCustom] = useState(() => readCustomCalls(campaignId));
  const [call, setCall] = useState('');
  const [title, setTitle] = useState({ text: '', body: '' });
  const [handout, setHandout] = useState(handoutDraft || { text: '', body: '' });
  const [search, setSearch] = useState('');
  const [sent, setSent] = useState(null);

  async function send(announcement) {
    const ok = await onSend({ ...announcement, toUser: to });
    if (ok) {
      setSent(announcement.text);
      window.setTimeout(() => setSent((s) => (s === announcement.text ? null : s)), 2000);
    }
    return ok;
  }

  function keep(text) {
    const next = [text, ...custom.filter((c) => c !== text)];
    setCustom(next);
    writeCustomCalls(campaignId, next);
  }

  function forget(text) {
    const next = custom.filter((c) => c !== text);
    setCustom(next);
    writeCustomCalls(campaignId, next);
  }

  const toName = to ? players.find((p) => p.userId === to)?.label : null;
  const matches = lore.filter((e) => !search.trim() || `${e.title} ${e.body}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 12);

  return (
    <div className="announce">
      {players.length > 0 && (
        <div className="announce-to" role="radiogroup" aria-label="Send to">
          <button type="button" role="radio" aria-checked={!to} className={`preset-chip${!to ? ' active' : ''}`} onClick={() => setTo(null)}>
            Everyone
          </button>
          {players.map((p) => (
            <button
              key={p.userId}
              type="button"
              role="radio"
              aria-checked={to === p.userId}
              className={`preset-chip${to === p.userId ? ' active' : ''}`}
              onClick={() => setTo(p.userId)}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
      {toName && <p className="hint-text announce-private">Only {toName} will see this (and you).</p>}

      <div className="party-views" role="tablist" aria-label="Kind of announcement">
        {[
          ['call', 'Call'],
          ['title', 'Title card'],
          ['handout', 'Handout'],
        ].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {sent && (
        <p className="announce-sent" role="status">
          Sent: “{sent}”
        </p>
      )}

      {tab === 'call' && (
        <>
          <div className="preset-grid">
            {custom.map((text) => (
              <span key={`c-${text}`} className="preset-chip preset-chip-custom">
                <button type="button" onClick={() => send({ style: 'call', text })}>
                  {text}
                </button>
                <button type="button" className="preset-chip-remove" onClick={() => forget(text)} aria-label={`Forget “${text}”`}>
                  ×
                </button>
              </span>
            ))}
            {PRESET_CALLS.map((text) => (
              <button key={text} type="button" className="preset-chip" onClick={() => send({ style: 'call', text })}>
                {text}
              </button>
            ))}
          </div>
          <form
            className="scene-log-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (call.trim() && (await send({ style: 'call', text: call.trim() }))) setCall('');
            }}
          >
            <input value={call} onChange={(e) => setCall(e.target.value)} placeholder="Something else…" maxLength={200} aria-label="Your own call" />
            <button type="button" className="btn btn-ghost btn-small" disabled={!call.trim()} onClick={() => keep(call.trim())} title="Keep as a preset">
              ★ Keep
            </button>
            <button type="submit" className="btn btn-primary btn-small" disabled={!call.trim()}>
              Send
            </button>
          </form>
        </>
      )}

      {tab === 'title' && (
        <>
          <div className="preset-grid">
            {PRESET_TITLES.map((t) => (
              <button key={t.text} type="button" className="preset-chip" onClick={() => send({ style: 'title', ...t })}>
                {t.text}
              </button>
            ))}
          </div>
          <form
            className="announce-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (title.text.trim() && (await send({ style: 'title', text: title.text.trim(), body: title.body.trim() || null }))) {
                setTitle({ text: '', body: '' });
              }
            }}
          >
            <input value={title.text} onChange={(e) => setTitle({ ...title, text: e.target.value })} placeholder="Chapter Three: The Sunken Keep" maxLength={120} aria-label="Title" />
            <input value={title.body} onChange={(e) => setTitle({ ...title, body: e.target.value })} placeholder="A line beneath it (optional)" maxLength={200} aria-label="Subtitle" />
            <button type="submit" className="btn btn-primary btn-small" disabled={!title.text.trim()}>
              Show Title Card
            </button>
          </form>
        </>
      )}

      {tab === 'handout' && (
        <>
          {lore.length > 0 && (
            <>
              <input className="announce-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a Lore entry…" aria-label="Find a Lore entry" />
              <ul className="lookup-results">
                {matches.map((e) => (
                  <li key={e.id}>
                    <button type="button" onClick={() => setHandout({ text: e.title, body: e.body })}>
                      <strong>{e.title}</strong>
                      <span>{e.category}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <form
            className="announce-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (handout.text.trim() && (await send({ style: 'handout', text: handout.text.trim(), body: handout.body.trim() || null }))) {
                setHandout({ text: '', body: '' });
              }
            }}
          >
            <input value={handout.text} onChange={(e) => setHandout({ ...handout, text: e.target.value })} placeholder="A letter sealed in black wax" maxLength={200} aria-label="Handout title" />
            <textarea value={handout.body} onChange={(e) => setHandout({ ...handout, body: e.target.value })} placeholder="What it says…" rows={5} maxLength={8000} aria-label="Handout text" />
            <button type="submit" className="btn btn-primary btn-small" disabled={!handout.text.trim()}>
              Hand It Out
            </button>
          </form>
        </>
      )}
    </div>
  );
}
