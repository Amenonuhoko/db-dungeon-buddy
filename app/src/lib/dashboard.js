import { loadRead, TABLE_THREAD } from './messages.js';
import { supabase } from './supabase';

// Everything the campaign hub shows at a glance, for every campaign the
// signed-in user belongs to, in a handful of queries rather than one set
// per campaign:
//
//   - the character they're wearing in each (name, class, HP, AC);
//   - whether a fight is on, and whose turn it is (and if it's theirs);
//   - unread Table Talk (same per-device read state as the Party page);
//   - the most recent note they can see;
//   - how many people are at the table.
//
// Each piece loads independently and is simply left out if it fails —
// e.g. a backend that predates Table Talk (008) still gets a dashboard.
const q = async (builder) => {
  const { data, error } = await builder;
  if (error) throw error;
  return data;
};
const settle = (promise) => promise.catch(() => null);

const DAY = 86400000;

export async function loadDashboard(campaigns, myId) {
  const ids = campaigns.map((c) => c.id);
  if (!ids.length || !myId) return {};
  const since = new Date(Date.now() - 30 * DAY).toISOString();

  const [sheets, encounters, messages, notes, members] = await Promise.all([
    settle(
      q(
        supabase
          .from('character_sheets')
          .select('id, campaign_id, name, class_and_level, race, current_hp, max_hp, armor_class')
          .eq('player_id', myId)
          .in('campaign_id', ids),
      ),
    ),
    settle(
      q(
        supabase
          .from('encounters')
          .select('id, campaign_id, name, round, current_combatant_id')
          .eq('active', true)
          .in('campaign_id', ids),
      ),
    ),
    settle(
      q(
        supabase
          .from('messages')
          .select('campaign_id, sender_id, recipient_id, created_at')
          .in('campaign_id', ids)
          .neq('sender_id', myId)
          .gt('created_at', since)
          .limit(1000),
      ),
    ),
    settle(
      q(
        supabase
          .from('notes')
          .select('campaign_id, title, updated_at')
          .in('campaign_id', ids)
          .order('updated_at', { ascending: false })
          .limit(200),
      ),
    ),
    settle(q(supabase.from('campaign_members').select('campaign_id, role').in('campaign_id', ids))),
  ]);

  const currentIds = (encounters || []).map((e) => e.current_combatant_id).filter(Boolean);
  const combatants = currentIds.length
    ? await settle(q(supabase.from('encounter_combatants').select('id, name, character_id').in('id', currentIds)))
    : [];
  const combatantById = Object.fromEntries((combatants || []).map((c) => [c.id, c]));

  const out = {};
  for (const id of ids) {
    const character = (sheets || []).find((s) => s.campaign_id === id) || null;
    const encounter = (encounters || []).find((e) => e.campaign_id === id) || null;
    const current = encounter?.current_combatant_id ? combatantById[encounter.current_combatant_id] : null;

    let unread = null;
    if (messages) {
      const read = loadRead(id);
      unread = messages.filter((m) => {
        if (m.campaign_id !== id) return false;
        const thread = m.recipient_id ? m.sender_id : TABLE_THREAD;
        return !read[thread] || m.created_at > read[thread];
      }).length;
    }

    const latestNote = (notes || []).find((n) => n.campaign_id === id) || null;
    const players = members ? members.filter((m) => m.campaign_id === id && m.role === 'player').length : null;

    out[id] = {
      character: character && {
        id: character.id,
        name: character.name,
        classAndLevel: character.class_and_level,
        race: character.race,
        currentHp: character.current_hp,
        maxHp: character.max_hp,
        armorClass: character.armor_class,
      },
      fight: encounter && {
        name: encounter.name,
        round: encounter.round,
        turnName: current?.name || null,
        myTurn: Boolean(character && current?.character_id === character.id),
      },
      unread,
      latestNote: latestNote && { title: latestNote.title, updatedAt: latestNote.updated_at },
      players,
    };
  }
  return out;
}

export function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days}d ago` : new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}
