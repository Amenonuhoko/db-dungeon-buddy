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

export function renameGuestCampaign(id, name) {
  const list = readGuestCampaigns().map((c) => (c.id === id ? { ...c, name } : c));
  writeGuestCampaigns(list);
  return list.find((c) => c.id === id) ?? null;
}

// Removes the campaign *and* everything stored under it on this device
// (contentStore keeps one localStorage key per kind per campaign —
// "codex.guest.content.<kind>.<campaignId>"), so deleting doesn't leave
// orphaned sheets and notes behind taking up storage.
export function deleteGuestCampaign(id) {
  writeGuestCampaigns(readGuestCampaigns().filter((c) => c.id !== id));
  try {
    const doomed = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && (key.endsWith(`.${id}`) && (key.startsWith('codex.guest.content.') || key.startsWith('dungeonbuddy.')))) {
        doomed.push(key);
      }
    }
    doomed.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Storage blocked — the campaign itself is already gone from the list.
  }
}

// ---------------------------------------------------------------------
// Account campaigns — thin wrappers over Supabase so screens never touch
// `supabase` directly.
// ---------------------------------------------------------------------

// campaign_members' RLS lets you see *every* member of a campaign you're
// in (the DM's roster needs that — listCampaignMembers below), so any
// "my campaigns" query has to filter to your own rows explicitly. Without
// the filter, a campaign with players in it came back once per member:
// duplicated in the hub, and getMyCampaign's .single() failed outright,
// locking both the DM and their players out the moment anyone joined.
async function myUserId() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const id = data.session?.user?.id;
  if (!id) throw new Error('Your session expired — log in again.');
  return id;
}

export async function listMyCampaigns() {
  const { data, error } = await supabase
    .from('campaign_members')
    .select('role, campaigns(id, name, description, dm_id, invite_code, created_at)')
    .eq('user_id', await myUserId())
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
  return { ...data, role: data.dm_id === (await myUserId()) ? 'dm' : 'player' };
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
    .eq('user_id', await myUserId())
    .maybeSingle();
  if (error) {
    console.error('Loading campaign failed:', error);
    if (/fetch|network/i.test(error.message || '')) throw new Error("Couldn't reach the server — check your connection and try again.");
    throw new Error(`Couldn't load that campaign (${error.message}).`);
  }
  if (!data?.campaigns) throw new Error("You're not in that campaign — ask its DM for the invite link.");
  return { ...data.campaigns, role: data.role };
}

// Everyone at the table, with a friendly name each — the DM's "whose
// character is this" picker and the campaign's member list. Two queries,
// not one embedded select: campaign_members.user_id and profiles.id both
// point at auth.users, but not at each other, so PostgREST has no
// relationship to embed through. (It used to try, fail, and the error was
// swallowed — the DM just saw "no players yet" however many had joined.)
export async function listCampaignMembers(campaignId) {
  const { data: members, error } = await supabase
    .from('campaign_members')
    .select('user_id, role, joined_at')
    .eq('campaign_id', campaignId)
    .order('joined_at', { ascending: true });
  if (error) throw error;
  const ids = members.map((m) => m.user_id);
  const { data: profiles, error: profileError } = ids.length
    ? await supabase.from('profiles').select('id, display_name').in('id', ids)
    : { data: [], error: null };
  if (profileError) throw profileError;
  const names = Object.fromEntries(profiles.map((p) => [p.id, p.display_name]));
  return members.map((m) => ({
    userId: m.user_id,
    role: m.role,
    joinedAt: m.joined_at,
    displayName: names[m.user_id] || 'Adventurer',
  }));
}

// RLS turns a write you're not allowed to make into "0 rows affected",
// not an error — so every destructive call below asks for the affected
// rows back and treats none as a refusal, instead of reporting success.
function expectRows(data, message) {
  if (!data || data.length === 0) throw new Error(message);
  return data;
}

// 007_hardening.sql adds these server functions/policies; say so plainly
// when the backend hasn't been updated yet rather than surfacing a raw
// "function not found".
function needsMigration(error) {
  if (error?.code === 'PGRST202' || /could not find the function/i.test(error?.message || '')) {
    return new Error("This needs the latest database update — whoever runs the backend should run db/migrations/007_hardening.sql (see README).");
  }
  return error;
}

export async function updateCampaign(id, { name, description }) {
  const { data, error } = await supabase
    .from('campaigns')
    .update({ name, description })
    .eq('id', id)
    .select();
  if (error) throw error;
  return expectRows(data, 'Only the DM can change this campaign.')[0];
}

// Cascades to everything in the campaign — members, characters, notes,
// lore, monsters, fights, rolls (every table's campaign_id is
// "on delete cascade").
export async function deleteCampaign(id) {
  const { data, error } = await supabase.from('campaigns').delete().eq('id', id).select('id');
  if (error) throw error;
  expectRows(data, 'Only the DM can delete this campaign.');
}

export async function removeMember(campaignId, userId) {
  const { data, error } = await supabase
    .from('campaign_members')
    .delete()
    .eq('campaign_id', campaignId)
    .eq('user_id', userId)
    .select('user_id');
  if (error) throw error;
  expectRows(data, "Couldn't remove that player.");
}

export async function regenerateInviteCode(campaignId) {
  const { data, error } = await supabase.rpc('regenerate_invite_code', { p_campaign_id: campaignId });
  if (error) throw needsMigration(error);
  return data;
}

export async function leaveCampaign(id) {
  const { data, error } = await supabase
    .from('campaign_members')
    .delete()
    .eq('campaign_id', id)
    .eq('user_id', await myUserId())
    .select('user_id');
  if (error) throw error;
  expectRows(data, "The DM can't leave their own campaign — delete it instead.");
}
