import { BookIcon, MapIcon, PawIcon, QuillIcon, ShieldIcon } from '../components/ornament/TabIcons.jsx';

// A player's whole surface is the Scene (BIBLE.md §1/§4): where everyone
// stands, the fight on the tokens themselves, the log, Talk and Stash —
// and their own sheet, one tap away. Everything else is the DM's
// backstage: handing out characters (Party), lore, monsters and notes.
// Those tabs don't exist for a player at all, not just read-only.
export const DM_ONLY_TABS = ['characters', 'encyclopedia', 'bestiary', 'notes'];

// Route paths keep their original names (characters, encyclopedia,
// bestiary) so existing links keep working — only what people read
// changed.
export const ALL_TABS = [
  { to: 'scene', label: 'Scene', icon: <MapIcon /> },
  { to: 'characters', label: 'Party', icon: <ShieldIcon /> },
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
