import { supabase } from './supabase';

// The personal board in Notes (db/migrations/013_personal_boards.sql) —
// one private drawing per person per campaign, stored as its strokes:
//   [{ c: colour name, w: width, e: 1 if eraser, p: [x0, y0, x1, y1, …] }]
// with integer points in a fixed BOARD_WIDTH-wide space so it scales to
// any screen. Offline campaigns keep it on the device (same key prefix as
// other guest content, so deleting the campaign clears it).
export const BOARD_WIDTH = 1000;
export const BOARD_HEIGHT = 1250;
export const BOARD_MAX_BYTES = 900000; // the database allows 1 MB

const localKey = (campaignId) => `codex.guest.content.board.${campaignId}`;

export function boardMissing(error) {
  return error?.code === '42P01' || error?.code === 'PGRST205' || /table 'public\.boards'|relation .*boards/i.test(error?.message || '');
}

export async function loadBoard(status, campaignId, userId) {
  if (status === 'guest') {
    try {
      return JSON.parse(localStorage.getItem(localKey(campaignId)) || '[]');
    } catch {
      return [];
    }
  }
  const { data, error } = await supabase
    .from('boards')
    .select('strokes')
    .eq('campaign_id', campaignId)
    .eq('owner_id', userId)
    .maybeSingle();
  if (error) throw error;
  return Array.isArray(data?.strokes) ? data.strokes : [];
}

export async function saveBoard(status, campaignId, userId, strokes) {
  if (status === 'guest') {
    localStorage.setItem(localKey(campaignId), JSON.stringify(strokes));
    return;
  }
  const { error } = await supabase
    .from('boards')
    .upsert({ campaign_id: campaignId, owner_id: userId, strokes }, { onConflict: 'campaign_id,owner_id' });
  if (error) throw error;
}
