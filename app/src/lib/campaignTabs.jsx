import { BookIcon, PawIcon, QuillIcon, ShieldIcon, SwordsIcon } from '../components/ornament/TabIcons.jsx';

// Encyclopedia and Bestiary are the DM's world-building tools — lore and
// monster stats a DM authors for their own reference, not something a
// player needs a tab for. A player's whole surface is their own Notes
// and their own Character sheet, so those two tabs simply don't exist
// for them (not just locked/read-only — see BIBLE.md §4/§9).
export const DM_ONLY_TABS = ['encyclopedia', 'bestiary'];

// Plain words, in the order the table actually uses them: who's playing,
// the fight, then the DM's prep material, then notes. Route paths keep
// their original names (encyclopedia, bestiary, characters) so existing
// links keep working — only what people read changed. A player's tabs
// are the same list minus the DM-only ones, in the same order.
export const ALL_TABS = [
  { to: 'characters', label: 'Party', icon: <ShieldIcon /> },
  // Visible to players too — everyone at the table needs to see whose
  // turn it is (BIBLE.md §8, Phase 4).
  { to: 'combat', label: 'Combat', icon: <SwordsIcon /> },
  { to: 'encyclopedia', label: 'Lore', icon: <BookIcon /> },
  { to: 'bestiary', label: 'Monsters', icon: <PawIcon /> },
  { to: 'notes', label: 'Notes', icon: <QuillIcon /> },
];

export function tabsForRole(isDM) {
  return isDM ? ALL_TABS : ALL_TABS.filter((tab) => !DM_ONLY_TABS.includes(tab.to));
}

// The same tabs as absolute paths — for screens outside the campaign
// shell's <Outlet> (the character sheet), where relative links would
// resolve against the wrong route.
export function absoluteTabs(campaignId, isDM) {
  return tabsForRole(isDM).map((tab) => ({ ...tab, to: `/campaigns/${campaignId}/${tab.to}` }));
}
