import { createLocalStore, createSupabaseStore } from './contentStore';
import { supabase } from './supabase';

// The Party Stash (db/migrations/008_party.sql): loot the party holds in
// common, plus one shared coin purse. Any member can change it — it's the
// party's, not the DM's. Offline campaigns keep it on the device, same
// as every other content type (BIBLE.md §4).
const localItems = createLocalStore('party_items');
const remoteItems = createSupabaseStore('party_items');
const items = (status) => (status === 'guest' ? localItems : remoteItems);

export const COINS = [
  { key: 'pp', label: 'Platinum', gp: 10 },
  { key: 'gp', label: 'Gold', gp: 1 },
  { key: 'ep', label: 'Electrum', gp: 0.5 },
  { key: 'sp', label: 'Silver', gp: 0.1 },
  { key: 'cp', label: 'Copper', gp: 0.01 },
];

export const EMPTY_PURSE = { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };

export function purseInGold(purse) {
  return COINS.reduce((sum, c) => sum + (purse[c.key] || 0) * c.gp, 0);
}

export function listItems(status, campaignId) {
  return items(status)
    .list(campaignId)
    .then((list) => [...list].sort((a, b) => a.name.localeCompare(b.name)));
}

export function addItem(status, campaignId, fields) {
  return items(status).create(campaignId, {
    name: fields.name.trim(),
    quantity: Math.max(1, Number(fields.quantity) || 1),
    carriedBy: (fields.carriedBy || '').trim(),
    note: (fields.note || '').trim(),
  });
}

export function updateItem(status, campaignId, id, patch) {
  return items(status).update(campaignId, id, patch);
}

export function removeItem(status, campaignId, id) {
  return items(status).remove(campaignId, id);
}

// Guest purse: same key prefix as contentStore, so deleting an offline
// campaign (deleteGuestCampaign) clears it along with everything else.
const localPurseKey = (campaignId) => `codex.guest.content.party_coins.${campaignId}`;

function readLocalPurse(campaignId) {
  try {
    return { ...EMPTY_PURSE, ...JSON.parse(localStorage.getItem(localPurseKey(campaignId)) || '{}') };
  } catch {
    return { ...EMPTY_PURSE };
  }
}

export async function getPurse(status, campaignId) {
  if (status === 'guest') return readLocalPurse(campaignId);
  const { data, error } = await supabase
    .from('party_coins')
    .select('pp, gp, ep, sp, cp')
    .eq('campaign_id', campaignId)
    .maybeSingle();
  if (error) throw error;
  return { ...EMPTY_PURSE, ...(data || {}) };
}

// delta > 0 adds, < 0 spends. Never lets a coin go below zero — the
// server function enforces the same rule atomically for the shared purse.
export async function adjustPurse(status, campaignId, coin, delta) {
  if (!Number.isInteger(delta) || delta === 0) throw new Error('Enter a whole number of coins.');
  if (status === 'guest') {
    const purse = readLocalPurse(campaignId);
    if (purse[coin] + delta < 0) throw new Error(`The party doesn't have that much ${coin}.`);
    const next = { ...purse, [coin]: purse[coin] + delta };
    localStorage.setItem(localPurseKey(campaignId), JSON.stringify(next));
    return next;
  }
  const { data, error } = await supabase.rpc('adjust_party_coins', {
    p_campaign_id: campaignId,
    p_coin: coin,
    p_delta: delta,
  });
  if (error) throw error;
  return { pp: data.pp, gp: data.gp, ep: data.ep, sp: data.sp, cp: data.cp };
}
