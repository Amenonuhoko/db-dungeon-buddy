import { useSceneArt } from '../lib/scenes.js';

// The world glimpsed behind a campaign card (BIBLE.md §1 step 5) — the
// same "the scene bleeds through" idea as CampaignBackdrop, scaled down
// to a card: enough of the picture to feel like a door into that game,
// not so much it fights the card's own text. `scene` is
// dash[id].scene from lib/dashboard.js, or lib/scenes.js's
// useCampaignScene() for guest campaigns — either way
// { backgroundPath, mood } or null/undefined for "no scene yet". `live`
// is a separate boolean (the two sources spell "is this the DM's live
// scene" differently: `.active` vs `.live`) rather than read off `scene`
// here, so callers don't have to normalize their data just to use this.
//
// The Live badge sits as its own absolutely-positioned corner overlay,
// not inline with the card's name/role text — the card is the one
// place in the hub where several campaign names sit close together,
// some long, and an inline badge competing with them in a
// `flex-shrink: 0` meta row previously squeezed the name down to one
// character per line on anything but a very short name.
export function CampaignCardArt({ scene, live }) {
  const art = useSceneArt(scene?.backgroundPath || null);
  const tone = scene?.mood?.time || scene?.mood?.light || null;
  return (
    <>
      <div className="card-art" aria-hidden="true">
        {art && <div className="card-art-picture" style={{ backgroundImage: `url(${art})` }} />}
        <div className={`card-art-scrim${tone ? ` campaign-backdrop-${tone}` : ''}`} />
      </div>
      {live && (
        <span className="chip chip-small live-badge">
          <span className="live-dot" aria-hidden="true" />
          Live
        </span>
      )}
    </>
  );
}
