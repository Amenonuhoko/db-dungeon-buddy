import { useEffect, useRef } from 'react';
import { hasBackend, supabase } from './supabase';

// Things the DM shows the table that are never stored — the measuring
// line, for now — sent over a Realtime broadcast channel,
// "scene:<campaign id>" (db/migrations/016_scene_grid.sql: members listen,
// only the DM sends). Like presence, it's a private channel that falls
// back to an ordinary one if the private join is refused (016 not run,
// or Realtime authorization unavailable).
//
// Returns send(event, payload) for any of `events`; `onMessage(event,
// payload)` hears everyone else's. Offline there's no one to tell, so
// send is a no-op.
export function useSceneBroadcast(enabled, campaignId, events, onMessage) {
  const channelRef = useRef(null);
  const handler = useRef(onMessage);
  useEffect(() => {
    handler.current = onMessage;
  });

  const eventList = events.join(',');

  useEffect(() => {
    if (!enabled || !hasBackend) return undefined;
    let cancelled = false;
    let current = null;
    const topic = `scene:${campaignId}`;

    async function connect(isPrivate) {
      const stale = supabase.getChannels().find((c) => c.topic === `realtime:${topic}`);
      if (stale) await supabase.removeChannel(stale);
      if (cancelled) return;
      const ch = supabase.channel(topic, { config: { private: isPrivate, broadcast: { self: false } } });
      current = ch;
      for (const name of eventList.split(',')) {
        ch.on('broadcast', { event: name }, ({ event, payload }) => handler.current(event, payload));
      }
      ch.subscribe((status) => {
        if (current !== ch) return;
        if (status === 'SUBSCRIBED') channelRef.current = ch;
        else if (isPrivate && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) connect(false);
      });
    }

    connect(true);
    return () => {
      cancelled = true;
      channelRef.current = null;
      if (current) supabase.removeChannel(current);
    };
  }, [enabled, campaignId, eventList]);

  return (event, payload) => {
    channelRef.current?.send({ type: 'broadcast', event, payload }).catch(() => {});
  };
}
