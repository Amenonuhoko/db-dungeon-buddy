import { useEffect, useRef, useSyncExternalStore } from 'react';
import { hasBackend, supabase } from './supabase';

// "Who's at the table right now" — Supabase Realtime Presence, one
// channel per campaign ("presence:<campaign id>"). Presence is ephemeral:
// nothing is written to the database; each open app announces itself
// ({ userId, name, role, where }) and disappears when it closes, locks,
// or loses its connection.
//
// One shared connection per campaign, not one per screen: the campaign
// tabs and the character sheet are different routes, and tearing the
// channel down on every navigation would make everyone see you "leave"
// and "arrive" each time you tapped between them. Screens acquire the
// campaign's manager; the last one to let go closes it a few seconds
// later, so moving between screens never drops you.
//
// The channel is private (db/migrations/008_party.sql lets only the
// campaign's members join it). If the private join is refused — 008 not
// run yet, or Realtime authorization unavailable — it falls back to an
// ordinary channel so the feature still works; see BIBLE.md §5.
const TEARDOWN_MS = 4000;
const managers = new Map();

function latestMeta(metas) {
  return metas.reduce((a, b) => ((a.at || 0) >= (b.at || 0) ? a : b));
}

function createManager(campaignId) {
  const listeners = new Set();
  const eventListeners = new Set();
  let snapshot = { online: {}, ready: false };
  let me = null;
  let channel = null;
  let subscribed = false;
  let refs = 0;
  let teardownTimer = null;

  const emit = () => listeners.forEach((l) => l());

  function onSync() {
    if (!channel) return;
    const next = {};
    for (const [key, metas] of Object.entries(channel.presenceState())) {
      if (metas.length) next[key] = latestMeta(metas);
    }
    // The first sync is everyone who was already here — not news. After
    // that, the difference between syncs is who arrived and who left.
    if (snapshot.ready) {
      for (const key of Object.keys(next)) {
        if (!snapshot.online[key] && key !== me?.userId) eventListeners.forEach((fn) => fn({ type: 'join', who: next[key] }));
      }
      for (const key of Object.keys(snapshot.online)) {
        if (!next[key] && key !== me?.userId) eventListeners.forEach((fn) => fn({ type: 'leave', who: snapshot.online[key] }));
      }
    }
    snapshot = { online: next, ready: true };
    emit();
  }

  // supabase-js hands back an existing channel for the same topic, and
  // removing one is async — so clear out any stale channel for this topic
  // (a quick leave-and-return, or the private→public fallback) before
  // making a fresh one. `generation` drops work that's been superseded.
  let generation = 0;

  async function connect(isPrivate) {
    const mine = ++generation;
    subscribed = false;
    const topic = `presence:${campaignId}`;
    const stale = supabase.getChannels().find((c) => c.topic === `realtime:${topic}`);
    if (stale) await supabase.removeChannel(stale);
    if (mine !== generation || !me) return;
    const ch = supabase.channel(topic, {
      config: { private: isPrivate, presence: { key: me.userId, enabled: true } },
    });
    channel = ch;
    ch.on('presence', { event: 'sync' }, onSync);
    ch.subscribe((status) => {
      if (channel !== ch) return;
      if (status === 'SUBSCRIBED') {
        subscribed = true;
        ch.track(me);
      } else if (isPrivate && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) {
        connect(false);
      }
    });
  }

  let connecting = false;

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    onEvent(fn) {
      eventListeners.add(fn);
      return () => eventListeners.delete(fn);
    },
    acquire(payload) {
      refs += 1;
      window.clearTimeout(teardownTimer);
      me = { ...me, ...payload, at: Date.now() };
      if (!channel && !connecting) {
        connecting = true;
        connect(true).finally(() => {
          connecting = false;
        });
      } else if (channel && subscribed) channel.track(me);
    },
    update(payload) {
      me = { ...me, ...payload, at: Date.now() };
      if (channel && subscribed) channel.track(me);
    },
    release() {
      refs -= 1;
      if (refs > 0) return;
      teardownTimer = window.setTimeout(() => {
        if (refs > 0) return;
        const ch = channel;
        generation += 1;
        channel = null;
        subscribed = false;
        if (ch) supabase.removeChannel(ch);
        snapshot = { online: {}, ready: false };
        managers.delete(campaignId);
        emit();
      }, TEARDOWN_MS);
    },
  };
}

function managerFor(campaignId) {
  if (!managers.has(campaignId)) managers.set(campaignId, createManager(campaignId));
  return managers.get(campaignId);
}

const EMPTY = { online: {}, ready: false };
const noopStore = { subscribe: () => () => {}, getSnapshot: () => EMPTY };

// Announce yourself on this campaign's table and read who else is there.
// `me` = { userId, name, role }; `where` = a short status string (see
// describeWhere). Returns { online: { [userId]: meta }, ready }.
export function useCampaignPresence(enabled, campaignId, me, where) {
  const active = Boolean(enabled && hasBackend && campaignId && me?.userId);
  const manager = active ? managerFor(campaignId) : null;
  const latest = useRef({ me, where });
  useEffect(() => {
    latest.current = { me, where };
  });

  useEffect(() => {
    if (!manager) return undefined;
    manager.acquire({ ...latest.current.me, where: latest.current.where });
    return () => manager.release();
  }, [manager]);

  const name = me?.name;
  const role = me?.role;
  useEffect(() => {
    if (manager) manager.update({ name, role, where });
  }, [manager, name, role, where]);

  const store = manager || noopStore;
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

// Arrivals and departures (not the initial roster), for toasts.
export function usePresenceEvents(enabled, campaignId, handler) {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });
  useEffect(() => {
    if (!enabled || !hasBackend || !campaignId) return undefined;
    return managerFor(campaignId).onEvent((event) => handlerRef.current(event));
  }, [enabled, campaignId]);
}

const TAB_WHERE = {
  characters: 'with the party',
  combat: 'on Combat',
  encyclopedia: 'reading the lore',
  bestiary: 'in the bestiary',
  notes: 'in their notes',
};

// "tab:combat" → "on Combat"; "sheet:Mira" → "on Mira's sheet".
export function describeWhere(where) {
  if (!where) return 'at the table';
  const [kind, ...rest] = where.split(':');
  const value = rest.join(':');
  if (kind === 'tab') return TAB_WHERE[value] || 'at the table';
  if (kind === 'sheet') return value ? `on ${value}'s sheet` : 'on a character sheet';
  if (kind === 'choosing') return 'choosing a character';
  return 'at the table';
}
