import { supabase } from './supabase';

// Two genuinely different shapes behind one concept — see BIBLE.md §4/§7:
//
//   - Guest campaigns are local sandboxes: no DM/player relationship,
//     no invite code, nothing shared. Stored as a flat array in
//     localStorage, tagged with the role the guest entered with.
//   - Account campaigns are real rows in `campaigns`/`campaign_members`,
//     with an invite code a DM can hand out and a role that's actually
//     enforced server-side by RLS.
//
// Screens branch on session status and call the matching half below —
// there's no attempt to paper over the difference with one shared shape,
// because the difference (shared vs. not) is the whole point.

const GUEST_CAMPAIGNS_KEY = 'codex.guest.campaigns';

function readGuestCampaigns() {
  try {
    const raw = localStorage.getItem(GUEST_CAMPAIGNS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeGuestCampaigns(list) {
  localStorage.setItem(GUEST_CAMPAIGNS_KEY, JSON.stringify(list));
}

export function listGuestCampaigns() {
  return readGuestCampaigns().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getGuestCampaign(id) {
  return readGuestCampaigns().find((c) => c.id === id) ?? null;
}

export function createGuestCampaign(name, role) {
  const campaign = {
    id: crypto.randomUUID(),
    name,
    role,
    createdAt: new Date().toISOString(),
  };
  writeGuestCampaigns([...readGuestCampaigns(), campaign]);
  return campaign;
}

export function deleteGuestCampaign(id) {
  writeGuestCampaigns(readGuestCampaigns().filter((c) => c.id !== id));
}

// ---------------------------------------------------------------------
// Account campaigns — thin wrappers over Supabase so screens never touch
// `supabase` directly.
// ---------------------------------------------------------------------

export async function listMyCampaigns() {
  const { data, error } = await supabase
    .from('campaign_members')
    .select('role, campaigns(id, name, description, dm_id, invite_code, created_at)')
    .order('created_at', { referencedTable: 'campaigns', ascending: false });
  if (error) throw error;
  return data.map((row) => ({ ...row.campaigns, role: row.role }));
}

export async function createCampaign(name, description) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const { data, error } = await supabase
    .from('campaigns')
    .insert({ name, description, dm_id: userData.user.id })
    .select()
    .single();
  if (error) throw error;
  return { ...data, role: 'dm' };
}

// Codes are generated as lowercase hex (001_core.sql). People copy them
// out of chat apps and type them on phones, so forgive stray spaces,
// capitals, and a pasted whole invite link.
export function normalizeInviteCode(input) {
  const raw = (input || '').trim();
  const fromLink = raw.match(/[?&]code=([^&#\s]+)/);
  const code = fromLink ? decodeURIComponent(fromLink[1]) : raw;
  return code.replace(/\s+/g, '').toLowerCase();
}

export async function joinCampaignByCode(code) {
  const { data: campaignId, error: rpcError } = await supabase.rpc('join_campaign_with_code', {
    p_code: normalizeInviteCode(code),
  });
  if (rpcError) throw friendlyJoinError(rpcError);
  const { data, error } = await supabase.from('campaigns').select().eq('id', campaignId).single();
  if (error) throw friendlyJoinError(error);
  // The DM opening their own invite link lands here too — keep their
  // real role rather than claiming they just joined as a player.
  const { data: auth } = await supabase.auth.getSession();
  return { ...data, role: data.dm_id === auth.session?.user?.id ? 'dm' : 'player' };
}

function friendlyJoinError(error) {
  const message = error?.message || '';
  if (/invalid invite code/i.test(message)) {
    return new Error("That code doesn't match any campaign — double-check it with your DM (or ask them for the invite link).");
  }
  // PGRST202: the join function doesn't exist — migrations not run.
  if (error?.code === 'PGRST202' || /could not find the function/i.test(message)) {
    return new Error("This backend isn't set up for joining yet — whoever runs it needs to run the database migrations (see README).");
  }
  if (/fetch|network/i.test(message) || error?.name === 'TypeError') {
    return new Error("Couldn't reach the server — check your connection and try again.");
  }
  console.error('Join error:', error);
  return new Error(`Couldn't join that campaign${message ? ` (${message})` : ''}.`);
}

export async function getMyCampaign(id) {
  const { data, error } = await supabase
    .from('campaign_members')
    .select('role, campaigns(id, name, description, dm_id, invite_code, created_at)')
    .eq('campaign_id', id)
    .single();
  if (error) throw error;
  return { ...data.campaigns, role: data.role };
}

// Used by the DM's "hand out a character sheet" picker (CharactersScreen)
// — needs a friendly name per member, hence the join to profiles.
export async function listCampaignMembers(campaignId) {
  const { data, error } = await supabase
    .from('campaign_members')
    .select('user_id, role, profiles(display_name)')
    .eq('campaign_id', campaignId);
  if (error) throw error;
  return data.map((m) => ({ userId: m.user_id, role: m.role, displayName: m.profiles?.display_name || 'Unknown' }));
}

export async function leaveCampaign(id) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const { error } = await supabase
    .from('campaign_members')
    .delete()
    .eq('campaign_id', id)
    .eq('user_id', userData.user.id);
  if (error) throw error;
}
