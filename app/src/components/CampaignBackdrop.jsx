import { useSceneArt } from '../lib/scenes.js';

// Atmosphere for the rest of the app (BIBLE.md §1, Phase 6 step 5) — proof
// of concept. The campaign's live scene (or its last one) bleeds through
// behind every backstage screen, heavily blurred and dimmed, the same way
// the character sheet already sits over the scene. No picture yet (a
// brand-new campaign) falls back to the ambient background alone.
export function CampaignBackdrop({ scene }) {
  const art = useSceneArt(scene?.backgroundPath || null);
  const tone = scene?.mood?.time || scene?.mood?.light || null;

  return (
    <div className="campaign-backdrop" aria-hidden="true">
      {art && <div className="campaign-backdrop-art" style={{ backgroundImage: `url(${art})` }} />}
      <div className={`campaign-backdrop-scrim${tone ? ` campaign-backdrop-${tone}` : ''}`} />
    </div>
  );
}
