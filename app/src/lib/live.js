import { useCallback, useEffect, useRef, useState } from 'react';
import { hasBackend, supabase } from './supabase';

// Live updates for one campaign (account mode only — guest mode has no
// shared backend to hear from). Any insert/update/delete on `tables`
// calls `onChange`, debounced so a burst (a player joining and creating
// their character a moment later) triggers one refetch, not several. The
// caller just refetches; deltas aren't worth merging by hand at this
// scale. Returns an unsubscribe function.
//
// DELETE events can't be filtered by column in Supabase Realtime, so
// those are subscribed to unfiltered — under RLS they carry only the
// deleted row's primary key, so nothing leaks; a delete in some other
// campaign just costs this one a harmless refetch.
let channelSeq = 0;

export function subscribeToCampaignTables(campaignId, tables, onChange) {
  if (!hasBackend) return () => {};
  let timer = null;
  const fire = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(onChange, 150);
  };
  // Unique per subscription: two screens listening to the same campaign
  // at once (Party + the settings panel) must not share one channel.
  channelSeq += 1;
  let channel = supabase.channel(`campaign:${campaignId}:${channelSeq}`);
  for (const table of tables) {
    channel = channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter: `campaign_id=eq.${campaignId}` }, fire)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter: `campaign_id=eq.${campaignId}` }, fire)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, fire);
  }
  channel.subscribe();
  return () => {
    window.clearTimeout(timer);
    supabase.removeChannel(channel);
  };
}

// The hook form every live screen uses: Realtime, plus two safety nets —
// a phone that was asleep misses Realtime events, so coming back to the
// tab refetches; and a slow poll while the tab is visible covers a
// backend where Realtime isn't set up for a table yet (e.g. migration 007
// not run, so campaign_members isn't published). `refresh` should be
// quiet — errors are the screen's own business on its normal load.
const POLL_MS = 30000;

export function useCampaignLive(enabled, campaignId, tables, refresh) {
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });
  const tableKey = tables.join(',');

  useEffect(() => {
    if (!enabled) return undefined;
    const quiet = () => Promise.resolve(refreshRef.current()).catch(() => {});
    const unsubscribe = subscribeToCampaignTables(campaignId, tableKey.split(','), quiet);
    const onVisible = () => {
      if (document.visibilityState === 'visible') quiet();
    };
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') quiet();
    }, POLL_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      unsubscribe();
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, campaignId, tableKey]);
}

// Who's wearing which character in this campaign: { [userId]: character
// name }. Held once by CampaignScreen so every "Mira (Wren)" label — At
// the table, Talk, toasts — agrees, and kept live as people slip in and
// out (character_sheets is on Realtime since 005).
export function useWornCharacters(enabled, campaignId, listSheets) {
  const [worn, setWorn] = useState({});
  const load = useCallback(async () => {
    const sheets = await listSheets('authenticated', campaignId);
    setWorn(Object.fromEntries(sheets.filter((s) => s.playerId).map((s) => [s.playerId, s.name])));
  }, [campaignId, listSheets]);
  useEffect(() => {
    if (enabled) load().catch(() => {});
  }, [enabled, load]);
  useCampaignLive(enabled, campaignId, ['character_sheets'], load);
  return worn;
}
