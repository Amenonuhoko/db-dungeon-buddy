import { useEffect, useRef, useState } from 'react';
import { hueFor, initials } from '../lib/avatar.js';
import { TABLE_THREAD, threadOf } from '../lib/messages.js';

// Table Talk — the whole table's conversation plus a private whisper
// thread with each other member. The thread list shows who's here and
// what's unread; opening one shows the conversation. `talk` is the
// campaign's useTableTalk() state (held in CampaignScreen), `thread` /
// `onThread` which conversation is open (the Party page keeps it in the
// URL so toasts and the "At the table" strip can open one directly).
function timeLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function TableTalk({ talk, members, online, thread, onThread }) {
  const nameOf = (userId) => members.find((m) => m.userId === userId)?.displayName || online[userId]?.name || 'Someone';

  if (talk.status === 'unavailable') {
    return (
      <p className="hint-text">
        Table Talk needs the latest database update — whoever runs the backend should run
        db/migrations/008_party.sql (see README).
      </p>
    );
  }
  if (talk.status === 'error') return <p className="error-text">Couldn't load messages — {talk.error}</p>;

  if (thread) {
    return <Thread talk={talk} thread={thread} nameOf={nameOf} online={online} onBack={() => onThread(null)} />;
  }

  const others = members.filter((m) => m.userId !== talk.myId);
  const threads = [TABLE_THREAD, ...others.map((m) => m.userId)];
  const lastIn = (key) => [...talk.messages].reverse().find((m) => threadOf(m, talk.myId) === key);

  return (
    <ul className="talk-threads">
      {threads.map((key) => {
        const last = lastIn(key);
        const unread = talk.unread[key] || 0;
        const isTable = key === TABLE_THREAD;
        return (
          <li key={key}>
            <button type="button" className={`talk-thread${unread ? ' has-unread' : ''}`} onClick={() => onThread(key)}>
              <span
                className={`presence-avatar${isTable ? ' table-avatar' : ''}`}
                style={isTable ? undefined : { '--hue': hueFor(key) }}
                aria-hidden="true"
              >
                {isTable ? '✦' : initials(nameOf(key))}
                {!isTable && <span className={`presence-dot${online[key] ? ' online' : ''}`} />}
              </span>
              <span className="talk-thread-text">
                <span className="talk-thread-name">{isTable ? 'Everyone at the table' : `Whisper · ${nameOf(key)}`}</span>
                <span className="talk-thread-preview">
                  {last
                    ? `${last.senderId === talk.myId ? 'You' : nameOf(last.senderId)}: ${last.body}`
                    : isTable
                      ? 'Say hello to the party'
                      : 'Private — only the two of you can read it'}
                </span>
              </span>
              {unread > 0 && <span className="talk-unread">{unread}</span>}
            </button>
          </li>
        );
      })}
      {others.length === 0 && (
        <li className="hint-text" style={{ padding: '0.5rem 0.25rem' }}>
          Whispers appear here once other players join.
        </li>
      )}
    </ul>
  );
}

function Thread({ talk, thread, nameOf, online, onBack }) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const endRef = useRef(null);
  const isTable = thread === TABLE_THREAD;
  const messages = talk.messages.filter((m) => threadOf(m, talk.myId) === thread);
  const { setViewing } = talk;

  useEffect(() => {
    setViewing(thread);
    return () => setViewing(null);
  }, [thread, setViewing]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  async function submit(event) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    try {
      await talk.send(isTable ? null : thread, body);
      setDraft('');
    } catch (err) {
      setError(/row-level security/i.test(err.message || '') ? "Couldn't send — are they still in the campaign?" : err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="talk-thread-view">
      <div className="talk-thread-head">
        <button type="button" className="example-toggle" onClick={onBack}>
          ← All conversations
        </button>
        <div>
          <strong>{isTable ? 'Everyone at the table' : `Whisper · ${nameOf(thread)}`}</strong>
          {!isTable && (
            <span className="talk-privacy">
              {online[thread] ? 'Here now · ' : ''}Only you and {nameOf(thread)} can read this.
            </span>
          )}
        </div>
      </div>

      <ol className="talk-messages" aria-live="polite">
        {messages.length === 0 && (
          <li className="hint-text talk-empty">
            {isTable ? 'Nothing said yet.' : `Pass ${nameOf(thread)} a note — nobody else will see it.`}
          </li>
        )}
        {messages.map((m) => {
          const mine = m.senderId === talk.myId;
          return (
            <li key={m.id} className={`talk-message${mine ? ' mine' : ''}`}>
              {!mine && isTable && <span className="talk-sender">{nameOf(m.senderId)}</span>}
              <span className="talk-bubble">{m.body}</span>
              <span className="talk-meta">
                {timeLabel(m.createdAt)}
                {mine && (
                  <button type="button" className="talk-delete" onClick={() => talk.remove(m.id).catch((err) => setError(err.message))} aria-label="Delete message">
                    Delete
                  </button>
                )}
              </span>
            </li>
          );
        })}
        <li ref={endRef} aria-hidden="true" />
      </ol>

      {error && <p className="error-text">{error}</p>}
      <form className="talk-compose" onSubmit={submit}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={isTable ? 'Message the table…' : `Whisper to ${nameOf(thread)}…`}
          maxLength={2000}
          aria-label="Message"
        />
        <button className="btn btn-primary btn-small" type="submit" disabled={sending || !draft.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
