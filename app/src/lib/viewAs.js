import { useCallback, useEffect, useState } from 'react';

// "View as player" — a DM previewing their own campaign the way players
// see it: player tabs, the Choose-your-character flow, the player Party
// page, no DM-only notes or hidden conditions. Purely a *view*: the
// database still knows they're the DM (RLS is unchanged), so this is for
// seeing and testing the player side, not a second identity. Remembered
// per campaign, per device, so it survives moving between the campaign
// tabs and a character sheet.
const key = (campaignId) => `dungeonbuddy.viewAsPlayer.${campaignId}`;

export function readViewAsPlayer(campaignId) {
  try {
    return localStorage.getItem(key(campaignId)) === '1';
  } catch {
    return false;
  }
}

function writeViewAsPlayer(campaignId, on) {
  try {
    if (on) localStorage.setItem(key(campaignId), '1');
    else localStorage.removeItem(key(campaignId));
  } catch {
    // Storage blocked — the switch still works until the page reloads.
  }
}

export function useViewAsPlayer(campaignId) {
  const [on, setOn] = useState(() => readViewAsPlayer(campaignId));
  useEffect(() => {
    setOn(readViewAsPlayer(campaignId));
  }, [campaignId]);
  const set = useCallback(
    (next) => {
      writeViewAsPlayer(campaignId, next);
      setOn(next);
    },
    [campaignId],
  );
  return [on, set];
}
