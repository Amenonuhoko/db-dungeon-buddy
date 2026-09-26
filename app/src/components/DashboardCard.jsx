import { CampaignCardArt } from './CampaignCardArt.jsx';
import { Portrait } from './Portrait.jsx';
import { timeAgo } from '../lib/dashboard.js';

// One campaign on the hub, with what matters at a glance (lib/dashboard.js):
// for a player, the character they're wearing — name, class, HP, AC — one
// tap from its sheet (or a nudge to choose one); for everyone, whether a
// fight is on and whose turn it is, unread Table Talk, the latest note,
// and (running a game) how many players are at the table.
export function DashboardCard({ campaign, info, onOpen }) {
  const base = `/campaigns/${campaign.id}`;
  const isDM = campaign.role === 'dm';
  const character = info?.character;
  const fight = info?.fight;
  const hpPct = character?.maxHp ? Math.max(0, Math.min(100, ((character.currentHp ?? 0) / character.maxHp) * 100)) : null;
  const band = hpPct == null ? 'ok' : hpPct > 50 ? 'ok' : hpPct > 25 ? 'warn' : 'danger';

  return (
    <div className={`panel dash-card${fight?.myTurn ? ' my-turn' : ''}`}>
      <CampaignCardArt scene={info?.scene} live={info?.scene?.live} />
      <button type="button" className="dash-card-head" onClick={() => onOpen(base)}>
        <span className="campaign-card-name">{campaign.name}</span>
        <span aria-hidden="true" className="campaign-card-arrow">
          →
        </span>
      </button>

      <div className="dash-status">
        {fight ? (
          fight.myTurn ? (
            <button type="button" className="chip chip-small dash-chip-hot" onClick={() => onOpen(`${base}/scene`)}>
              Your turn!
            </button>
          ) : (
            <button type="button" className="chip chip-small dash-chip-fight" onClick={() => onOpen(`${base}/scene`)}>
              {fight.turnName ? `In combat · Round ${fight.round} · ${fight.turnName}’s turn` : 'A fight is being set up'}
            </button>
          )
        ) : null}
        {info?.unread > 0 && (
          <button type="button" className="chip chip-small dash-chip-unread" onClick={() => onOpen(`${base}/scene?panel=talk`)}>
            {info.unread} new {info.unread === 1 ? 'message' : 'messages'}
          </button>
        )}
        {isDM && info?.players != null && (
          <span className="chip chip-small">
            {info.players === 0 ? 'No players yet' : `${info.players} ${info.players === 1 ? 'player' : 'players'}`}
          </span>
        )}
      </div>

      {!isDM &&
        (character ? (
          <button type="button" className="dash-character" onClick={() => onOpen(`${base}/characters/${character.id}`)}>
            <Portrait path={character.portraitPath} name={character.name} size="sm" />
            <span className="dash-character-text">
              <span className="dash-character-name">{character.name}</span>
              <span className="dash-character-sub">{[character.classAndLevel, character.race].filter(Boolean).join(' · ') || 'Open the sheet'}</span>
              {hpPct != null && (
                <span className="dash-character-hp">
                  <span className="hp-track hp-track-slim">
                    <span className={`hp-track-fill hp-track-fill-${band}`} style={{ width: `${hpPct}%`, display: 'block' }} />
                  </span>
                  <span className="combat-hp-numbers">
                    {character.currentHp ?? '—'}/{character.maxHp}
                  </span>
                  {character.armorClass != null && <span className="chip chip-small">AC {character.armorClass}</span>}
                </span>
              )}
            </span>
          </button>
        ) : (
          <div className="dash-no-character">
            <span>No character yet.</span>
            <button type="button" className="btn btn-primary btn-small" onClick={() => onOpen(`${base}/choose`)}>
              Choose a Character
            </button>
          </div>
        ))}

      {isDM && info?.latestNote && (
        <button type="button" className="dash-note" onClick={() => onOpen(`${base}/notes`)}>
          Latest note: “{info.latestNote.title}” · {timeAgo(info.latestNote.updatedAt)}
        </button>
      )}
    </div>
  );
}
