import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { subscribeToCampaignTables } from './live';
import { supabase } from './supabase';

// Table Talk (db/migrations/008_party.sql): one conversation with the
// whole table, plus a private whisper thread with each other member —
// only the two people in a whisper can ever read it (not even the DM).
// Account mode only; an offline campaign lives on one device, so there's
// nobody to talk to.
//
// Threads are keyed 'all' (the whole table) or the other person's user
// id. What you've read is remembered per device, in localStorage.
const PAGE = 300;

export const TABLE_THREAD = 'all';

export function threadOf(message, myId) {
  if (!message.recipientId) return TABLE_THREAD;
  return message.senderId === myId ? message.recipientId : message.senderId;
}

function toMessage(row) {
  return {
    id: row.id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    body: row.body,
    createdAt: row.created_at,
  };
}

// Missing table = migration 008 not run on this backend yet.
export function isMissingTable(error) {
  return error?.code === '42P01' || error?.code === 'PGRST205' || /could not find the table|does not exist/i.test(error?.message || '');
}

export async function listMessages(campaignId) {
  const { data, error } = await supabase
    .from('messages')
    .select('id, sender_id, recipient_id, body, created_at')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .limit(PAGE);
  if (error) throw error;
  return data.map(toMessage).reverse();
}

export async function sendMessage(campaignId, recipientId, body) {
  const { data, error } = await supabase
    .from('messages')
    .insert({ campaign_id: campaignId, recipient_id: recipientId || null, body })
    .select('id, sender_id, recipient_id, body, created_at')
    .single();
  if (error) throw error;
  return toMessage(data);
}

export async function deleteMessage(id) {
  const { error } = await supabase.from('messages').delete().eq('id', id);
  if (error) throw error;
}

const readKey = (campaignId) => `dungeonbuddy.read.${campaignId}`;

export function loadRead(campaignId) {
  try {
    return JSON.parse(localStorage.getItem(readKey(campaignId)) || '{}');
  } catch {
    return {};
  }
}

function saveRead(campaignId, map) {
  try {
    localStorage.setItem(readKey(campaignId), JSON.stringify(map));
  } catch {
    // Storage blocked — unread counts just won't survive a reload.
  }
}

// Everything the campaign needs from Table Talk, held once per campaign
// (CampaignScreen) so the Party page, the tab-dock badge and the
// "new message" toasts all agree. `onIncoming` fires for each message
// that arrives from someone else after the first load.
export function useTableTalk(enabled, campaignId, myId, onIncoming) {
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | unavailable | error
  const [error, setError] = useState(null);
  const [read, setRead] = useState(() => loadRead(campaignId));
  const [viewing, setViewingState] = useState(null); // thread currently open on screen
  const viewingRef = useRef(null);
  const setViewing = useCallback((thread) => {
    viewingRef.current = thread;
    setViewingState(thread);
  }, []);
  const known = useRef(null);
  const incomingRef = useRef(onIncoming);
  useEffect(() => {
    setRead(loadRead(campaignId));
  }, [campaignId]);
  useEffect(() => {
    incomingRef.current = onIncoming;
  });

  const refresh = useCallback(async () => {
    try {
      const list = await listMessages(campaignId);
      if (known.current) {
        list
          .filter((m) => !known.current.has(m.id) && m.senderId !== myId && threadOf(m, myId) !== viewingRef.current)
          .forEach((m) => incomingRef.current?.(m, threadOf(m, myId)));
      }
      known.current = new Set(list.map((m) => m.id));
      setMessages(list);
      setStatus('ready');
      setError(null);
    } catch (err) {
      if (isMissingTable(err)) setStatus('unavailable');
      else {
        setStatus('error');
        setError(err.message);
      }
    }
  }, [campaignId, myId]);

  useEffect(() => {
    if (!enabled) return undefined;
    known.current = null;
    refresh();
    const unsubscribe = subscribeToCampaignTables(campaignId, ['messages'], refresh);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, campaignId, refresh]);

  const markRead = useCallback(
    (thread) => {
      setRead((prev) => {
        const next = { ...prev, [thread]: new Date().toISOString() };
        saveRead(campaignId, next);
        return next;
      });
    },
    [campaignId],
  );

  // Whatever's open on screen is read the moment it arrives.
  const newestInViewing = viewing ? messages.filter((m) => threadOf(m, myId) === viewing).at(-1)?.id : null;
  useEffect(() => {
    if (viewing && newestInViewing) markRead(viewing);
  }, [viewing, newestInViewing, markRead]);

  const unread = useMemo(() => {
    const counts = {};
    for (const m of messages) {
      if (m.senderId === myId) continue;
      const thread = threadOf(m, myId);
      if (thread === viewing) continue;
      if (!read[thread] || m.createdAt > read[thread]) counts[thread] = (counts[thread] || 0) + 1;
    }
    return counts;
  }, [messages, read, myId, viewing]);

  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);

  const send = useCallback(
    async (recipientId, body) => {
      const message = await sendMessage(campaignId, recipientId, body);
      known.current?.add(message.id);
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      return message;
    },
    [campaignId],
  );

  const remove = useCallback(async (id) => {
    await deleteMessage(id);
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  return { enabled, status, error, messages, unread, totalUnread, send, remove, markRead, viewing, setViewing, myId };
}
