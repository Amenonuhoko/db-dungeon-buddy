import { createLocalStore, createSupabaseStore } from './contentStore';
import { hasBackend, supabase } from './supabase';

// The initiative tracker's data (BIBLE.md §7, Phase 4). Same guest/account
// split as every other content type: guest mode keeps encounters in
// localStorage (a DM running combat on one device, no sync), account mode
// uses the Supabase tables from db/migrations/005_live_play.sql and gets
// live updates via subscribeToCampaignLive() below.

const localEncounters = createLocalStore('encounters');
const remoteEncounters = createSupabaseStore('encounters');
const encountersFor = (status) => (status === 'guest' ? localEncounters : remoteEncounters);

const localCombatants = createLocalStore('encounter_combatants');
const remoteCombatants = createSupabaseStore('encounter_combatants');
const combatantsFor = (status) => (status === 'guest' ? localCombatants : remoteCombatants);

// The SRD condition list, offered as quick picks — the DM can still type
// anything else ("Hexed", "Concentrating", "Marked by Renn").
export const STANDARD_CONDITIONS = [
  'Blinded',
  'Charmed',
  'Concentrating',
  'Deafened',
  'Frightened',
  'Grappled',
  'Incapacitated',
  'Invisible',
  'Paralyzed',
  'Petrified',
  'Poisoned',
  'Prone',
  'Restrained',
  'Stunned',
  'Unconscious',
];

export function listEncounters(status, campaignId) {
  return encountersFor(status).list(campaignId);
}

export function createEncounter(status, campaignId, fields) {
  return encountersFor(status).create(campaignId, { round: 1, currentCombatantId: null, active: true, ...fields });
}

export function updateEncounter(status, campaignId, id, patch) {
  return encountersFor(status).update(campaignId, id, patch);
}

export function listCombatants(status, campaignId) {
  return combatantsFor(status).list(campaignId);
}

// `initiative` is deliberately left out unless the caller supplies one,
// so the database default applies: null ("hasn't rolled yet") once
// 006_player_initiative.sql has run, or the legacy 0 before that.
export function addCombatant(status, campaignId, fields) {
  return combatantsFor(status).create(campaignId, { dexModifier: 0, conditions: [], ...fields });
}

export function hasRolled(combatant) {
  return combatant.initiative != null;
}

// A player setting their *own* character's initiative. They can't write
// combatant rows directly (DM-only RLS), so account mode goes through
// the narrow set_my_initiative() function from 006_player_initiative.sql.
export async function setOwnInitiative(status, campaignId, combatantId, value) {
  if (status === 'guest') return updateCombatant(status, campaignId, combatantId, { initiative: value });
  const { error } = await supabase.rpc('set_my_initiative', { p_combatant_id: combatantId, p_initiative: value });
  if (error) throw error;
  return null;
}

export function updateCombatant(status, campaignId, id, patch) {
  return combatantsFor(status).update(campaignId, id, patch);
}

export function removeCombatant(status, campaignId, id) {
  return combatantsFor(status).remove(campaignId, id);
}

export function abilityMod(score) {
  return Math.floor((Number(score ?? 10) - 10) / 2);
}

export function rollD20() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] % 20) + 1;
}

export function rollInitiative(dexModifier) {
  return rollD20() + (Number(dexModifier) || 0);
}

// Turn order: highest initiative first. Ties go to the higher DEX
// modifier (the usual table rule), then alphabetically so the order is
// at least stable instead of reshuffling on every refetch.
// Anyone who hasn't rolled yet sorts to the bottom rather than posing as
// a 0.
export function sortCombatants(combatants) {
  return [...combatants].sort(
    (a, b) =>
      Number(hasRolled(b)) - Number(hasRolled(a)) ||
      (b.initiative ?? 0) - (a.initiative ?? 0) ||
      (b.dexModifier ?? 0) - (a.dexModifier ?? 0) ||
      a.name.localeCompare(b.name),
  );
}

// Returns the patch for moving the turn marker one step (direction 1 or
// -1). Stepping past the last combatant wraps to the top and starts a new
// round; stepping back past the first goes to the previous round's last
// combatant (never below round 1). If the current combatant was removed
// mid-fight, forward lands on whoever's first rather than getting stuck.
export function stepTurn(encounter, ordered, direction) {
  if (ordered.length === 0) return { currentCombatantId: null };
  const index = ordered.findIndex((c) => c.id === encounter.currentCombatantId);
  if (index === -1) return { currentCombatantId: ordered[0].id };
  let next = index + direction;
  let round = encounter.round ?? 1;
  if (next >= ordered.length) {
    next = 0;
    round += 1;
  } else if (next < 0) {
    if (round <= 1) return {};
    next = ordered.length - 1;
    round -= 1;
  }
  return { currentCombatantId: ordered[next].id, round };
}

// Clamped HP change for a monster/NPC combatant. PCs go through
// hpPatch() in lib/characters.js instead, since their HP lives on the
// character sheet (BIBLE.md §7).
export function combatantHpPatch(combatant, amount) {
  const max = combatant.maxHp ?? Infinity;
  return { currentHp: Math.max(0, Math.min(max, (combatant.currentHp ?? 0) + amount)) };
}

// What a *player* sees for a monster's health — exact numbers stay with
// the DM (a common table convention), but "is it nearly dead?" is fair
// game, the same thing you'd see across a real table.
export function healthDescriptor(current, max) {
  if (max == null || max <= 0 || current == null) return null;
  if (current <= 0) return 'Down';
  const pct = current / max;
  if (pct > 0.75) return 'Healthy';
  if (pct > 0.5) return 'Wounded';
  if (pct > 0.25) return 'Bloodied';
  return 'Near death';
}

// Live updates for one campaign (account mode only — guest mode has no
// shared backend to hear from). Any insert/update/delete on the tables
// the combat view reads calls `onChange` (debounced — a "Next Turn" plus
// an HP change arriving together triggers one refetch, not two). The
// caller just refetches; deltas aren't worth merging by hand at this
// scale. Returns an unsubscribe function.
//
// DELETE events can't be filtered by column in Supabase Realtime, so
// those are subscribed to unfiltered — they carry only the deleted row's
// primary key under RLS, so nothing leaks; a delete in some other
// campaign just costs this one a harmless refetch.
const LIVE_TABLES = ['encounters', 'encounter_combatants', 'character_sheets', 'character_conditions', 'dice_rolls'];

export function subscribeToCampaignLive(campaignId, onChange) {
  if (!hasBackend) return () => {};
  let timer = null;
  const fire = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(onChange, 150);
  };
  let channel = supabase.channel(`campaign-live:${campaignId}`);
  for (const table of LIVE_TABLES) {
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
