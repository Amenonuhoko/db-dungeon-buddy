import { useEffect, useState } from 'react';
import { getGuestCampaign, getMyCampaign } from './campaigns.js';
import { useSession } from './SessionContext.jsx';
import { readViewAsPlayer } from './viewAs.js';

// The same "which campaign, what role in it" resolution CampaignScreen
// does, pulled out so a screen that deliberately opts out of the shared
// campaign chrome (CharacterSheetScreen — see BIBLE.md §3/§9) can still
// answer "am I the DM" without duplicating the guest/account branch.
export function useCampaignAccess(campaignId) {
  const { status } = useSession();
  const [campaign, setCampaign] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setCampaign(null);
    setError(null);
    if (status === 'guest') {
      const found = getGuestCampaign(campaignId);
      if (found) setCampaign(found);
      else setError('That local campaign no longer exists on this device.');
      return;
    }
    if (status === 'authenticated') {
      getMyCampaign(campaignId)
        .then(setCampaign)
        .catch((err) => setError(err.message || "You don't have access to that campaign."));
    }
  }, [status, campaignId]);

  // A DM previewing as a player (lib/viewAs.js) gets the player view;
  // isRealDM is for the few things that are about the campaign itself
  // rather than play (settings, "played by").
  const isRealDM = campaign?.role === 'dm';
  const previewAsPlayer = isRealDM && readViewAsPlayer(campaignId);
  return {
    campaign,
    loading: !campaign && !error,
    error,
    isDM: isRealDM && !previewAsPlayer,
    isRealDM,
    previewAsPlayer,
    isGuest: status === 'guest',
    status,
  };
}
