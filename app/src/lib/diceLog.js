import { hasBackend, supabase } from './supabase';

// The shared table roll log (BIBLE.md §7, Phase 4) — account mode only.
// DiceRoller.jsx posts here automatically when it's opened from inside a
// campaign; CombatScreen.jsx reads it. Guest mode keeps the roller's own
// per-device history and nothing else — there's no table to share with.

const LOG_LIMIT = 30;

export async function listRolls(campaignId) {
  if (!hasBackend) return [];
  const { data, error } = await supabase
    .from('dice_rolls')
    .select('id, display_name, expression, rolls, total, created_by, created_at')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .limit(LOG_LIMIT);
  if (error) throw error;
  return data.map((r) => ({
    id: r.id,
    displayName: r.display_name,
    expression: r.expression,
    rolls: r.rolls,
    total: r.total,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }));
}

export async function logRoll(campaignId, { displayName, expression, rolls, total }) {
  if (!hasBackend) return;
  const { error } = await supabase.from('dice_rolls').insert({
    campaign_id: campaignId,
    display_name: (displayName || 'Someone').slice(0, 60),
    expression: expression.slice(0, 60),
    rolls,
    total,
  });
  if (error) throw error;
}

export async function clearRolls(campaignId) {
  if (!hasBackend) return;
  const { error } = await supabase.from('dice_rolls').delete().eq('campaign_id', campaignId);
  if (error) throw error;
}
