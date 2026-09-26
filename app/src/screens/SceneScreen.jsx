import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { AddCombatantForm, CombatantRow } from '../components/CombatParts.jsx';
import { ConfirmButton } from '../components/ConfirmButton.jsx';
import { PartyStash } from '../components/PartyStash.jsx';
import { Portrait } from '../components/Portrait.jsx';
import { SceneLog } from '../components/SceneLog.jsx';
import { SceneStage } from '../components/SceneStage.jsx';
import { TablePresence } from '../components/TablePresence.jsx';
import { TableTalk } from '../components/TableTalk.jsx';
import { Panel } from '../components/ornament/Panel.jsx';
import { listCreatures } from '../lib/bestiary.js';
import { listCampaignMembers } from '../lib/campaigns.js';
import {
  addCondition,
  hpPatch,
  listConditions,
  listSheets,
  LOCAL_PLAYER_ID,
  removeCondition,
  updateSheet,
  wornByUser,
} from '../lib/characters.js';
import { clearRolls, listRolls } from '../lib/diceLog.js';
import {
  abilityMod,
  addCombatant,
  combatantHpPatch,
  createEncounter,
  hasRolled,
  healthDescriptor,
  listCombatants,
  listEncounters,
  removeCombatant,
  rollInitiative,
  setOwnInitiative,
  sortCombatants,
  stepTurn,
  updateCombatant,
  updateEncounter,
} from '../lib/encounters.js';
import { useCampaignLive } from '../lib/live.js';
import {
  addToken,
  clearEvents,
  clearSceneBackground,
  conditionEventText,
  createScene,
  explainArtError,
  hpEventText,
  listEvents,
  listScenes,
  listTokens,
  logEvent,
  openSpot,
  partySpot,
  placeCharacter,
  pushScene,
  removeScene,
  removeToken,
  SCENE_MIGRATION_HINT,
  SCENE_TABLES,
  sceneMissing,
  setSceneBackground,
  updateScene,
  updateToken,
} from '../lib/scenes.js';
import { useSession } from '../lib/SessionContext.jsx';

// The Scene — a player's whole surface (BIBLE.md §1/§7): the picture the
// DM has pushed to the table, everyone standing on it, and the log of what
// happened. There's no separate combat list: during a fight the tokens
// *are* the tracker (turn glow, initiative, health, conditions), and
// tapping one opens its full combat controls. The DM uses the same screen
// to prepare scenes the players can't see yet, then shows one.

const LIVE_TABLES = [
  ...SCENE_TABLES,
  'encounters',
  'encounter_combatants',
  'character_sheets',
  'character_conditions',
  'dice_rolls',
];

const HEALTH_PCT = { Healthy: 100, Wounded: 75, Bloodied: 50, 'Near death': 25, Down: 0 };

function bandOf(pct) {
  return pct > 50 ? 'ok' : pct > 25 ? 'warn' : 'danger';
}

function describeError(err) {
  if (sceneMissing(err)) return SCENE_MIGRATION_HINT;
  const msg = err?.message || '';
  if (err?.code === 'PGRST202' || /set_my_initiative/.test(msg) || /null value in column "initiative"/.test(msg)) {
    return 'Players rolling their own initiative needs db/migrations/006_player_initiative.sql run in Supabase first.';
  }
  return msg || 'Something went wrong.';
}

export function SceneScreen() {
  const { campaignId, isDM, isGuest, previewAsPlayer, presence, talk, worn } = useOutletContext();
  const { status, user } = useSession();
  const navigate = useNavigate();
  const live = status === 'authenticated';

  const [scenes, setScenes] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [encounters, setEncounters] = useState([]);
  const [combatants, setCombatants] = useState([]);
  const [sheets, setSheets] = useState([]);
  const [conditions, setConditions] = useState([]);
  const [events, setEvents] = useState([]);
  const [rolls, setRolls] = useState([]);
  const [creatures, setCreatures] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // The open token, remembered per scene so switching scenes closes it.
  const [selection, setSelection] = useState({ sceneId: null, key: null });
  const [toolsOpen, setToolsOpen] = useState(false);

  const [params, setParams] = useSearchParams();
  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === 'panel') next.delete('thread');
    setParams(next, { replace: true });
  };
  const panel = ['talk', 'stash'].includes(params.get('panel')) && (params.get('panel') === 'stash' || live) ? params.get('panel') : 'log';
  const thread = params.get('thread');

  const refresh = useCallback(async () => {
    const [sc, tk, enc, comb, sh, cond, ev] = await Promise.all([
      listScenes(status, campaignId),
      listTokens(status, campaignId),
      listEncounters(status, campaignId),
      listCombatants(status, campaignId),
      listSheets(status, campaignId),
      listConditions(status, campaignId),
      listEvents(status, campaignId),
    ]);
    const [bestiary, log, people] = await Promise.all([
      isDM ? listCreatures(status, campaignId).catch(() => []) : [],
      live ? listRolls(campaignId).catch(() => []) : [],
      live ? listCampaignMembers(campaignId).catch(() => []) : [],
    ]);
    setScenes(sc);
    setTokens(tk);
    setEncounters(enc);
    setCombatants(comb);
    setSheets(sh);
    setConditions(cond);
    setEvents(ev);
    setCreatures(bestiary);
    setRolls(log);
    setMembers(people);
  }, [status, campaignId, isDM, live]);

  useEffect(() => {
    setLoading(true);
    refresh()
      .then(() => setError(null))
      .catch((err) => setError(describeError(err)))
      .finally(() => setLoading(false));
  }, [refresh]);

  useCampaignLive(live, campaignId, LIVE_TABLES, refresh);

  // Every write: surface the error, then refetch so the screen shows what
  // was actually stored (Realtime would get there too — this doesn't wait).
  async function act(fn) {
    setError(null);
    try {
      await fn();
      await refresh();
      return true;
    } catch (err) {
      setError(describeError(err));
      refresh().catch(() => {});
      return false;
    }
  }

  // ---- What's on screen ---------------------------------------------------

  // A player (or the DM previewing as one) only ever sees the live scene;
  // the DM can look at any of theirs, the live one by default.
  const orderedScenes = useMemo(() => [...scenes].sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [scenes]);
  const liveScene = scenes.find((s) => s.active) || null;
  const scene = isDM ? orderedScenes.find((s) => s.id === params.get('scene')) || liveScene || orderedScenes[0] || null : liveScene;
  const scenesById = Object.fromEntries(scenes.map((s) => [s.id, s]));

  const fight = encounters.find((e) => e.active) || null;
  const fightHere = fight && scene && scene.encounterId === fight.id ? fight : null;
  const fightElsewhere = fight && !fightHere ? fight : null;
  const ordered = fightHere ? sortCombatants(combatants.filter((c) => c.encounterId === fightHere.id)) : [];
  const current = ordered.find((c) => c.id === fightHere?.currentCombatantId) || null;

  const sheetsById = Object.fromEntries(sheets.map((s) => [s.id, s]));
  const combatantsById = Object.fromEntries(combatants.map((c) => [c.id, c]));
  const shownConditions = previewAsPlayer
    ? conditions.filter((c) => c.visibleToParty !== false || sheetsById[c.characterId]?.playerId === user?.id)
    : conditions;
  const conditionsByCharacter = shownConditions.reduce((acc, c) => {
    (acc[c.characterId] ||= []).push(c);
    return acc;
  }, {});

  function ownsSheet(sheet) {
    if (!sheet) return false;
    if (isGuest) return sheet.playerId === LOCAL_PLAYER_ID;
    return sheet.playerId === user?.id;
  }
  const isMyCharacter = (sheet) => !isDM && ownsSheet(sheet);
  const myCharacter = isDM ? null : isGuest ? sheets.find((s) => s.playerId === LOCAL_PLAYER_ID) || null : wornByUser(sheets, user?.id);
  const myTurn = current?.isPc && isMyCharacter(sheetsById[current.characterId]);
  const myUnrolled = ordered.some((c) => c.isPc && !hasRolled(c) && isMyCharacter(sheetsById[c.characterId]));

  const sceneTokens = scene ? tokens.filter((t) => t.sceneId === scene.id) : [];
  const combatantFor = (sheetId) => ordered.find((c) => c.isPc && c.characterId === sheetId) || null;

  // Who stands on the scene: the party (worn characters online — an
  // unclaimed pre-made isn't at the table — and everyone offline), then
  // monsters in this fight, then the DM's walk-on NPCs.
  const partyOnScene = sheets.filter(
    (s) => isGuest || s.playerId || combatantFor(s.id) || sceneTokens.some((t) => t.characterId === s.id && !t.hidden),
  );

  const views = [];
  partyOnScene.forEach((sheet, i) => {
    const row = sceneTokens.find((t) => t.characterId === sheet.id) || null;
    if (row?.hidden && !isDM) return;
    const spot = row || partySpot(i, partyOnScene.length);
    const combatant = combatantFor(sheet.id);
    const pct = sheet.maxHp ? Math.max(0, Math.min(100, ((sheet.currentHp ?? 0) / sheet.maxHp) * 100)) : null;
    const mine = isMyCharacter(sheet);
    views.push({
      key: `pc:${sheet.id}`,
      kind: 'pc',
      name: sheet.name,
      portraitPath: sheet.portraitPath,
      x: spot.x,
      y: spot.y,
      hidden: Boolean(row?.hidden),
      row,
      sheet,
      combatant,
      isCurrent: Boolean(combatant && combatant.id === current?.id),
      initiative: combatant && hasRolled(combatant) ? combatant.initiative : null,
      hpPct: pct,
      hpBand: bandOf(pct ?? 100),
      down: sheet.maxHp != null && (sheet.currentHp ?? 0) <= 0,
      conditions: (conditionsByCharacter[sheet.id] || []).map((c) => c.label),
      mine,
      draggable: Boolean(scene) && (isDM || (mine && scene.active)),
      ariaLabel: `${sheet.name}${mine ? ' (you)' : ''}${combatant && combatant.id === current?.id ? ', taking their turn' : ''}`,
    });
  });
  for (const row of sceneTokens) {
    if (row.characterId) continue;
    const combatant = row.combatantId ? combatantsById[row.combatantId] : null;
    if (row.combatantId && !combatant) continue;
    if (combatant) {
      const exact = combatant.maxHp ? Math.max(0, Math.min(100, ((combatant.currentHp ?? 0) / combatant.maxHp) * 100)) : null;
      const pct = exact == null ? null : isDM ? exact : HEALTH_PCT[healthDescriptor(combatant.currentHp, combatant.maxHp)] ?? null;
      views.push({
        key: row.id,
        kind: 'monster',
        name: combatant.name,
        x: row.x,
        y: row.y,
        row,
        combatant,
        isCurrent: combatant.id === current?.id,
        initiative: hasRolled(combatant) && combatant.encounterId === fightHere?.id ? combatant.initiative : null,
        hpPct: pct,
        hpBand: bandOf(pct ?? 100),
        down: combatant.maxHp != null && (combatant.currentHp ?? 0) <= 0,
        conditions: combatant.conditions || [],
        draggable: isDM,
        ariaLabel: `${combatant.name}${combatant.id === current?.id ? ', taking their turn' : ''}`,
      });
    } else {
      views.push({
        key: row.id,
        kind: 'npc',
        name: row.label || 'Someone',
        x: row.x,
        y: row.y,
        row,
        hpPct: null,
        conditions: [],
        draggable: isDM,
        ariaLabel: row.label || 'Someone',
      });
    }
  }
  const selectedKey = selection.sceneId === scene?.id ? selection.key : null;
  const setSelectedKey = (key) => setSelection({ sceneId: scene?.id ?? null, key });
  const selected = views.find((v) => v.key === selectedKey) || null;

  // Whoever's up gets opened for the DM as the turn moves — the controls
  // for this turn's creature, without hunting for its token.
  const currentKey = views.find((v) => v.isCurrent)?.key || null;
  const lastCurrent = useRef(null);
  useEffect(() => {
    if (isDM && currentKey && currentKey !== lastCurrent.current) setSelection({ sceneId: scene?.id ?? null, key: currentKey });
    lastCurrent.current = currentKey;
  }, [isDM, currentKey, scene?.id]);

  // ---- Logging --------------------------------------------------------------

  // Automatic lines are only written for the live scene — the DM setting
  // up an ambush in a prep scene mustn't narrate it to the table early.
  async function note(text) {
    if (!text || !scene?.active) return;
    try {
      await logEvent(status, campaignId, { sceneId: scene.id, kind: 'auto', text });
    } catch {
      /* the log is a nicety — never fail the action over it */
    }
  }

  const postLine = (text) => act(() => logEvent(status, campaignId, { sceneId: scene?.id ?? null, kind: 'manual', text }));

  function clearLog() {
    act(async () => {
      await clearEvents(status, campaignId);
      if (live) await clearRolls(campaignId);
    });
  }

  // ---- Moving tokens --------------------------------------------------------

  function moveToken(key, x, y) {
    const view = views.find((v) => v.key === key);
    if (!view || !scene) return;
    setTokens((prev) =>
      view.row
        ? prev.map((t) => (t.id === view.row.id ? { ...t, x, y } : t))
        : [...prev, { id: `pending-${key}`, sceneId: scene.id, characterId: view.sheet.id, x, y, hidden: false }],
    );
    act(() =>
      view.kind === 'pc'
        ? placeCharacter(status, campaignId, { sceneId: scene.id, characterId: view.sheet.id, x, y, asDM: isDM, existing: view.row })
        : updateToken(status, campaignId, view.row.id, { x, y }),
    );
  }

  // ---- Scenes (DM) ----------------------------------------------------------

  async function newScene(name) {
    let created = null;
    const ok = await act(async () => {
      created = await createScene(status, campaignId, name);
    });
    if (ok && created) setParam('scene', created.id);
    return ok;
  }

  function showScene() {
    if (!scene) return;
    act(async () => {
      await pushScene(status, campaignId, scene.id);
      await logEvent(status, campaignId, { sceneId: scene.id, kind: 'auto', text: `The scene changes: ${scene.name}.` }).catch(() => {});
    });
  }

  // ---- The fight ------------------------------------------------------------

  async function startFight(name) {
    return act(async () => {
      const created = await createEncounter(status, campaignId, { name: name || 'Encounter' });
      await updateScene(status, campaignId, scene.id, { encounterId: created.id });
      const party = views.filter((v) => v.kind === 'pc' && !v.hidden);
      await Promise.all(
        party.map((v) =>
          addCombatant(status, campaignId, {
            encounterId: created.id,
            characterId: v.sheet.id,
            name: v.sheet.name,
            isPc: true,
            dexModifier: abilityMod(v.sheet.abilities?.dex),
          }),
        ),
      );
      await note(`${name || 'A fight'} breaks out — roll for initiative!`);
    });
  }

  // A fight started on another scene (or on the old list tracker) moves
  // here: its monsters step off the old scene and onto this one.
  function bringFightHere() {
    act(async () => {
      const inFight = combatants.filter((c) => c.encounterId === fightElsewhere.id && !c.isPc);
      const ids = new Set(inFight.map((c) => c.id));
      await Promise.all(tokens.filter((t) => t.combatantId && ids.has(t.combatantId)).map((t) => removeToken(status, campaignId, t.id)));
      await Promise.all(
        scenes.filter((s) => s.encounterId === fightElsewhere.id).map((s) => updateScene(status, campaignId, s.id, { encounterId: null })),
      );
      await updateScene(status, campaignId, scene.id, { encounterId: fightElsewhere.id });
      const taken = views.map((v) => ({ x: v.x, y: v.y }));
      for (const c of inFight) {
        const spot = openSpot(taken);
        taken.push(spot);
        await addToken(status, campaignId, { sceneId: scene.id, combatantId: c.id, ...spot });
      }
    });
  }

  function beginCombat() {
    if (ordered.length === 0) return;
    act(async () => {
      const settled = await Promise.all(
        ordered.map((c) => (hasRolled(c) ? c : updateCombatant(status, campaignId, c.id, { initiative: rollInitiative(c.dexModifier) }))),
      );
      const first = sortCombatants(settled)[0];
      await updateEncounter(status, campaignId, fightHere.id, { currentCombatantId: first.id, round: 1 });
      await note(`Combat begins — ${first.name} goes first.`);
    });
  }

  function step(direction) {
    const patch = stepTurn(fightHere, ordered, direction);
    if (Object.keys(patch).length === 0) return;
    act(async () => {
      await updateEncounter(status, campaignId, fightHere.id, patch);
      if (direction > 0 && patch.round > (fightHere.round ?? 1)) await note(`Round ${patch.round} begins.`);
    });
  }

  function endFight() {
    act(async () => {
      const ids = new Set(ordered.filter((c) => !c.isPc).map((c) => c.id));
      await Promise.all(sceneTokens.filter((t) => t.combatantId && ids.has(t.combatantId)).map((t) => removeToken(status, campaignId, t.id)));
      await updateEncounter(status, campaignId, fightHere.id, { active: false, currentCombatantId: null });
      await updateScene(status, campaignId, scene.id, { encounterId: null });
      await note('The fight is over.');
    });
  }

  function addToFight(entries) {
    const taken = views.map((v) => ({ x: v.x, y: v.y }));
    return act(async () => {
      for (const fields of entries) {
        const created = await addCombatant(status, campaignId, { encounterId: fightHere.id, ...fields });
        if (fields.isPc) {
          const view = views.find((v) => v.key === `pc:${fields.characterId}`);
          if (view?.hidden) {
            await placeCharacter(status, campaignId, { sceneId: scene.id, characterId: fields.characterId, hidden: false, asDM: true, existing: view.row });
          }
        } else {
          const spot = openSpot(taken);
          taken.push(spot);
          await addToken(status, campaignId, { sceneId: scene.id, combatantId: created.id, ...spot });
        }
        await note(`${fields.name} ${fields.isPc ? 'joins' : 'enters'} the fight.`);
      }
    });
  }

  function removeFromFight(combatant) {
    act(async () => {
      if (combatant.id === fightHere.currentCombatantId) {
        const rest = ordered.filter((c) => c.id !== combatant.id);
        const index = ordered.findIndex((c) => c.id === combatant.id);
        const next = rest[index] || rest[0] || null;
        await updateEncounter(status, campaignId, fightHere.id, { currentCombatantId: next?.id ?? null });
      }
      if (status === 'guest') {
        await Promise.all(tokens.filter((t) => t.combatantId === combatant.id).map((t) => removeToken(status, campaignId, t.id)));
      }
      await removeCombatant(status, campaignId, combatant.id);
      await note(`${combatant.name} leaves the fight.`);
    });
    setSelectedKey(null);
  }

  // HP and conditions: a PC's live on their sheet, a monster's on its row.
  function applyHp(view, amount) {
    if (view.kind === 'pc') {
      const sheet = view.sheet;
      const patch = hpPatch(sheet, amount);
      act(async () => {
        await updateSheet(status, campaignId, sheet.id, patch);
        await note(hpEventText(sheet.name, sheet.currentHp ?? 0, patch.currentHp, sheet.maxHp));
      });
    } else {
      const c = view.combatant;
      const patch = combatantHpPatch(c, amount);
      act(async () => {
        await updateCombatant(status, campaignId, c.id, patch);
        await note(hpEventText(c.name, c.currentHp ?? 0, patch.currentHp, c.maxHp));
      });
    }
  }

  function setInitiative(combatant, value) {
    act(() =>
      isDM ? updateCombatant(status, campaignId, combatant.id, { initiative: value }) : setOwnInitiative(status, campaignId, combatant.id, value),
    );
  }

  function addConditionTo(view, label) {
    act(async () => {
      if (view.kind === 'pc') {
        await addCondition(status, campaignId, { characterId: view.sheet.id, label, note: '', visibleToParty: true });
      } else {
        const next = [...new Set([...(view.combatant.conditions || []), label])];
        await updateCombatant(status, campaignId, view.combatant.id, { conditions: next });
      }
      await note(conditionEventText(view.name, label, true));
    });
  }

  function removeConditionFrom(view, condition) {
    act(async () => {
      if (view.kind === 'pc') {
        await removeCondition(status, campaignId, condition.id);
      } else {
        const next = (view.combatant.conditions || []).filter((c) => c !== condition.label);
        await updateCombatant(status, campaignId, view.combatant.id, { conditions: next });
      }
      await note(conditionEventText(view.name, condition.label, false));
    });
  }

  function setPcHidden(view, hidden) {
    act(async () => {
      await placeCharacter(status, campaignId, {
        sceneId: scene.id,
        characterId: view.sheet.id,
        x: view.x,
        y: view.y,
        hidden,
        asDM: true,
        existing: view.row,
      });
      await note(hidden ? `${view.name} leaves the scene.` : `${view.name} joins the scene.`);
    });
  }

  function addWalkOn(label) {
    return act(async () => {
      await addToken(status, campaignId, { sceneId: scene.id, label, ...openSpot(views.map((v) => ({ x: v.x, y: v.y }))) });
      await note(`${label} appears.`);
    });
  }

  function removeWalkOn(view) {
    act(() => removeToken(status, campaignId, view.row.id));
    setSelectedKey(null);
  }

  // ---- Render -----------------------------------------------------------------

  if (loading) return <p>Setting the scene…</p>;

  const sheetPath = (sheet) => `/campaigns/${campaignId}/characters/${sheet.id}`;
  const unreadTalk = talk?.totalUnread || 0;

  return (
    <div className="scene-screen">
      {error && <p className="error-text">{error}</p>}

      {!isDM && (
        <div className="scene-me">
          {myCharacter ? (
            <button type="button" className="btn btn-ghost btn-small scene-me-sheet" onClick={() => navigate(sheetPath(myCharacter))}>
              <Portrait path={myCharacter.portraitPath} name={myCharacter.name} size="sm" />
              <span>{myCharacter.name} — My Sheet</span>
            </button>
          ) : isGuest ? (
            <button type="button" className="btn btn-primary btn-small" onClick={() => navigate(`/campaigns/${campaignId}/characters`)}>
              Create My Character
            </button>
          ) : (
            <button type="button" className="btn btn-primary btn-small" onClick={() => navigate(`/campaigns/${campaignId}/choose`)}>
              Choose a Character
            </button>
          )}
          {!isGuest && myCharacter && (
            <button type="button" className="btn btn-ghost btn-small" onClick={() => navigate(`/campaigns/${campaignId}/choose`)}>
              Change
            </button>
          )}
        </div>
      )}

      {isDM && (
        <SceneBar
          scenes={orderedScenes}
          scene={scene}
          toolsOpen={toolsOpen}
          onPick={(id) => setParam('scene', id)}
          onNew={newScene}
          onShow={showScene}
          onToggleTools={() => setToolsOpen((o) => !o)}
        />
      )}

      {isDM && scene && toolsOpen && (
        <SceneTools
          key={scene.id}
          scene={scene}
          status={status}
          campaignId={campaignId}
          onRename={(name) => act(() => updateScene(status, campaignId, scene.id, { name }))}
          onChanged={() => refresh().catch(() => {})}
          onAddWalkOn={addWalkOn}
          onDelete={() =>
            act(async () => {
              await removeScene(status, campaignId, scene);
              setParam('scene', null);
              setToolsOpen(false);
            })
          }
        />
      )}

      {!scene ? (
        <Panel corners topRule style={{ textAlign: 'center' }}>
          <h3 style={{ fontSize: '1.05rem' }}>{isDM ? 'Set the Scene' : 'No Scene Yet'}</h3>
          <p style={{ marginTop: '0.5rem' }}>
            {isDM
              ? 'Make a scene — the tavern, the forest road, the dungeon room — give it a picture, then show it to your players. They’ll see where everyone stands, live.'
              : isGuest
                ? 'In offline play the DM runs the scene on their own device.'
                : 'When the DM shows a scene, it appears here — where everyone stands, and what’s happening.'}
          </p>
        </Panel>
      ) : (
        <>
          <div className="scene-title">
            <h3>{scene.name}</h3>
            {isDM && (scene.active ? <span className="chip chip-small scene-live-chip">Live</span> : <span className="chip chip-small">Only you can see this</span>)}
          </div>

          {fightHere && (
            <FightBar
              fight={fightHere}
              ordered={ordered}
              current={current}
              isDM={isDM}
              myTurn={myTurn}
              myUnrolled={myUnrolled}
              onBegin={beginCombat}
              onStep={step}
              onEnd={endFight}
              onPick={(c) => setSelectedKey(c.isPc ? `pc:${c.characterId}` : views.find((v) => v.combatant?.id === c.id)?.key || null)}
            />
          )}

          <SceneStage artPath={scene.backgroundPath} tokens={views} selectedKey={selectedKey} onSelect={setSelectedKey} onMove={moveToken} />

          {views.some((v) => v.draggable) && (
            <p className="hint-text scene-hint">{isDM ? 'Drag tokens to place them; tap one to open it.' : 'Drag your token to move; tap anyone to see them.'}</p>
          )}

          {selected && (
            <TokenPanel
              view={selected}
              inFight={Boolean(fightHere && selected.combatant && selected.combatant.encounterId === fightHere.id)}
              isCurrent={selected.isCurrent}
              isDM={isDM}
              pcConditions={selected.kind === 'pc' ? conditionsByCharacter[selected.sheet.id] || [] : null}
              canEditHp={isDM || (selected.kind === 'pc' && ownsSheet(selected.sheet))}
              canEditInitiative={isDM || (selected.kind === 'pc' && isMyCharacter(selected.sheet))}
              onClose={() => setSelectedKey(null)}
              onOpenSheet={selected.kind === 'pc' ? () => navigate(sheetPath(selected.sheet)) : null}
              onHp={(amount) => applyHp(selected, amount)}
              onInitiative={(value) => setInitiative(selected.combatant, value)}
              onRollInitiative={() => setInitiative(selected.combatant, rollInitiative(selected.combatant.dexModifier))}
              onRemoveFromFight={() => removeFromFight(selected.combatant)}
              onAddCondition={(label) => addConditionTo(selected, label)}
              onRemoveCondition={(c) => removeConditionFrom(selected, c)}
              onSetHidden={(hidden) => setPcHidden(selected, hidden)}
              onRemoveWalkOn={() => removeWalkOn(selected)}
            />
          )}

          {isDM && !fightHere && !fightElsewhere && <StartFight onStart={startFight} />}
          {isDM && fightElsewhere && (
            <Panel className="scene-fight-elsewhere">
              <p>
                <strong>{fightElsewhere.name}</strong> is still going
                {scenes.some((s) => s.encounterId === fightElsewhere.id)
                  ? ` on “${scenes.find((s) => s.encounterId === fightElsewhere.id).name}”`
                  : ''}
                .
              </p>
              <button type="button" className="btn btn-primary btn-small" onClick={bringFightHere}>
                Run It on This Scene
              </button>
            </Panel>
          )}
          {isDM && fightHere && (
            <AddCombatantForm
              creatures={creatures}
              availableSheets={sheets.filter((s) => !ordered.some((c) => c.characterId === s.id))}
              onAdd={addToFight}
            />
          )}
        </>
      )}

      <div className="party-views scene-panels" role="tablist" aria-label="Table">
        <button type="button" role="tab" aria-selected={panel === 'log'} className={panel === 'log' ? 'active' : ''} onClick={() => setParam('panel', null)}>
          Log
        </button>
        {live && (
          <button type="button" role="tab" aria-selected={panel === 'talk'} className={panel === 'talk' ? 'active' : ''} onClick={() => setParam('panel', 'talk')}>
            Talk
            {unreadTalk > 0 && <span className="party-views-badge">{unreadTalk > 9 ? '9+' : unreadTalk}</span>}
          </button>
        )}
        <button type="button" role="tab" aria-selected={panel === 'stash'} className={panel === 'stash' ? 'active' : ''} onClick={() => setParam('panel', 'stash')}>
          Stash
        </button>
      </div>

      {panel === 'log' && (
        <Panel>
          <SceneLog
            events={events}
            rolls={rolls}
            scenesById={scenesById}
            currentSceneId={scene?.id ?? null}
            isDM={isDM}
            onPost={postLine}
            onClear={clearLog}
          />
        </Panel>
      )}

      {panel === 'talk' && talk && (
        <>
          {presence && (
            <TablePresence
              members={members}
              online={presence.online || {}}
              ready={presence.ready}
              myId={user?.id}
              worn={worn}
              onWhisper={talk.status === 'unavailable' ? null : (userId) => setParams({ panel: 'talk', thread: userId }, { replace: true })}
            />
          )}
          <TableTalk
            talk={talk}
            members={members}
            online={presence?.online || {}}
            worn={worn}
            thread={thread}
            onThread={(t) => setParams({ panel: 'talk', ...(t ? { thread: t } : {}) }, { replace: true })}
          />
        </>
      )}

      {panel === 'stash' && <PartyStash status={status} campaignId={campaignId} characterNames={sheets.map((s) => s.name)} />}
    </div>
  );
}

// -----------------------------------------------------------------------

function SceneBar({ scenes, scene, toolsOpen, onPick, onNew, onShow, onToggleTools }) {
  const [naming, setNaming] = useState(null);

  async function submit(event) {
    event.preventDefault();
    const name = naming.trim();
    if (!name) return;
    if (await onNew(name.slice(0, 120))) setNaming(null);
  }

  if (naming !== null) {
    return (
      <form className="scene-bar" onSubmit={submit}>
        <input value={naming} onChange={(e) => setNaming(e.target.value)} placeholder="The Rusty Flagon" maxLength={120} autoFocus aria-label="Scene name" />
        <button className="btn btn-primary btn-small" type="submit" disabled={!naming.trim()}>
          Create
        </button>
        <button className="btn btn-ghost btn-small" type="button" onClick={() => setNaming(null)}>
          Cancel
        </button>
      </form>
    );
  }

  return (
    <div className="scene-bar">
      {scenes.length > 0 && (
        <select value={scene?.id || ''} onChange={(e) => onPick(e.target.value)} aria-label="Scene">
          {scenes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.active ? ' (live)' : ''}
            </option>
          ))}
        </select>
      )}
      <button className="btn btn-ghost btn-small" type="button" onClick={() => setNaming('')}>
        + New Scene
      </button>
      {scene && !scene.active && (
        <button className="btn btn-primary btn-small" type="button" onClick={onShow}>
          Show to Players
        </button>
      )}
      {scene && (
        <button className="btn btn-ghost btn-small" type="button" onClick={onToggleTools} aria-expanded={toolsOpen}>
          {toolsOpen ? 'Done' : 'Edit Scene'}
        </button>
      )}
    </div>
  );
}

function SceneTools({ scene, status, campaignId, onRename, onChanged, onAddWalkOn, onDelete }) {
  const [name, setName] = useState(scene.name);
  const [walkOn, setWalkOn] = useState('');
  const [busy, setBusy] = useState(false);
  const [artError, setArtError] = useState(null);
  const fileRef = useRef(null);

  async function chooseArt(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setArtError(null);
    try {
      await setSceneBackground(status, campaignId, scene, file);
      onChanged();
    } catch (err) {
      setArtError(explainArtError(err));
    } finally {
      setBusy(false);
    }
  }

  async function clearArt() {
    setBusy(true);
    setArtError(null);
    try {
      await clearSceneBackground(status, campaignId, scene);
      onChanged();
    } catch (err) {
      setArtError(explainArtError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="scene-tools">
      <form
        className="scene-tools-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && name.trim() !== scene.name) onRename(name.trim().slice(0, 120));
        }}
      >
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="sceneName">Name</label>
          <input id="sceneName" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </div>
        <button className="btn btn-ghost btn-small" type="submit" disabled={!name.trim() || name.trim() === scene.name}>
          Rename
        </button>
      </form>

      <div className="scene-tools-row">
        <input ref={fileRef} type="file" accept="image/*" onChange={chooseArt} hidden />
        <button className="btn btn-ghost btn-small" type="button" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? 'Working…' : scene.backgroundPath ? 'Change Picture' : 'Add a Picture'}
        </button>
        {scene.backgroundPath && (
          <button className="btn btn-ghost btn-small" type="button" onClick={clearArt} disabled={busy}>
            Remove Picture
          </button>
        )}
      </div>
      {artError && <p className="error-text">{artError}</p>}

      <form
        className="scene-tools-row"
        onSubmit={async (e) => {
          e.preventDefault();
          if (walkOn.trim() && (await onAddWalkOn(walkOn.trim().slice(0, 120)))) setWalkOn('');
        }}
      >
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="walkOn">Add someone to the scene</label>
          <input id="walkOn" value={walkOn} onChange={(e) => setWalkOn(e.target.value)} placeholder="The barkeep" maxLength={120} />
        </div>
        <button className="btn btn-ghost btn-small" type="submit" disabled={!walkOn.trim()}>
          Add
        </button>
      </form>
      <p className="hint-text" style={{ margin: 0 }}>
        For someone who might fight, start a fight and add them from the Bestiary instead — they get HP and initiative.
      </p>

      <div className="scene-tools-row" style={{ justifyContent: 'flex-end' }}>
        <ConfirmButton className="btn btn-ghost btn-small" confirmLabel="Tap again to delete" onConfirm={onDelete}>
          Delete Scene
        </ConfirmButton>
      </div>
    </Panel>
  );
}

function StartFight({ onStart }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button className="btn btn-ghost" type="button" onClick={() => setOpen(true)}>
        ⚔ Start a Fight Here
      </button>
    );
  }

  return (
    <Panel>
      <form
        style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const ok = await onStart(name.trim().slice(0, 120));
          setBusy(false);
          if (ok) setOpen(false);
        }}
      >
        <p className="hint-text" style={{ margin: 0 }}>
          Everyone in the party on this scene joins — add the opposition next.
        </p>
        <div className="field">
          <label htmlFor="fightName">Name (optional)</label>
          <input id="fightName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ambush at the Sea Caves" maxLength={120} />
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Drawing steel…' : 'Start the Fight'}
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      </form>
    </Panel>
  );
}

// Round, whose turn, the DM's turn controls, and the initiative order as
// a strip of names — tap one to open their token.
function FightBar({ fight, ordered, current, isDM, myTurn, myUnrolled, onBegin, onStep, onEnd, onPick }) {
  return (
    <Panel className="scene-fight">
      <div className="scene-fight-head">
        <div>
          <strong>{fight.name}</strong>
          <p style={{ fontSize: '0.85rem', marginTop: '0.15rem' }}>
            {current ? (
              <>
                Round {fight.round} · <span style={{ color: 'var(--gold-bright)' }}>{current.name}</span>’s turn
              </>
            ) : isDM ? (
              'Add everyone, then Begin — anyone who hasn’t rolled initiative is rolled for.'
            ) : myUnrolled ? (
              'Roll for initiative — tap your token.'
            ) : (
              'Waiting for the DM to begin…'
            )}
          </p>
        </div>
        {isDM && (
          <div className="combat-controls" style={{ marginTop: 0 }}>
            {!current ? (
              <button className="btn btn-primary btn-small" type="button" onClick={onBegin} disabled={ordered.length === 0}>
                Begin
              </button>
            ) : (
              <>
                <button
                  className="btn btn-ghost btn-small"
                  type="button"
                  onClick={() => onStep(-1)}
                  disabled={fight.round <= 1 && ordered[0]?.id === current.id}
                  aria-label="Previous turn"
                >
                  ◀
                </button>
                <button className="btn btn-primary btn-small" type="button" onClick={() => onStep(1)}>
                  Next Turn ▶
                </button>
              </>
            )}
            <ConfirmButton className="btn btn-ghost btn-small" confirmLabel="Tap again to end" onConfirm={onEnd}>
              End
            </ConfirmButton>
          </div>
        )}
      </div>
      {myTurn && <p className="combat-your-turn">It’s your turn!</p>}
      {ordered.length > 0 && (
        <ol className="scene-order" aria-label="Turn order">
          {ordered.map((c) => (
            <li key={c.id}>
              <button type="button" className={c.id === current?.id ? 'current' : ''} onClick={() => onPick(c)}>
                <span className="scene-order-init">{hasRolled(c) ? c.initiative : '—'}</span>
                {c.name}
              </button>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

// What a tapped token opens: the full combat row while it's in the fight,
// otherwise who they are (and, for the DM, taking them off the scene).
function TokenPanel({
  view,
  inFight,
  isCurrent,
  isDM,
  pcConditions,
  canEditHp,
  canEditInitiative,
  onClose,
  onOpenSheet,
  onHp,
  onInitiative,
  onRollInitiative,
  onRemoveFromFight,
  onAddCondition,
  onRemoveCondition,
  onSetHidden,
  onRemoveWalkOn,
}) {
  const sheet = view.sheet;
  return (
    <div className="scene-token-panel">
      {inFight ? (
        <CombatantRow
          combatant={view.combatant}
          sheet={sheet}
          pcConditions={pcConditions}
          isCurrent={isCurrent}
          isDM={isDM}
          isMine={view.mine}
          canEditInitiative={canEditInitiative}
          canEditHp={canEditHp}
          onHp={onHp}
          onInitiative={onInitiative}
          onRollInitiative={onRollInitiative}
          onRemove={onRemoveFromFight}
          onAddCondition={onAddCondition}
          onRemoveCondition={onRemoveCondition}
        />
      ) : (
        <Panel className="scene-token-card">
          <Portrait path={view.portraitPath} name={view.name} size="md" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="party-card-name">
              {view.name} {view.mine && <span className="chip chip-small">You</span>}
              {view.hidden && <span className="chip chip-small">Off this scene</span>}
            </p>
            {sheet && (sheet.classAndLevel || sheet.race) && <p className="party-card-sub">{[sheet.classAndLevel, sheet.race].filter(Boolean).join(' · ')}</p>}
            {sheet?.maxHp != null && (
              <div className="combat-hp">
                <div className="hp-track hp-track-slim">
                  <div className={`hp-track-fill hp-track-fill-${view.hpBand}`} style={{ width: `${view.hpPct}%` }} />
                </div>
                <span className="combat-hp-numbers">
                  {sheet.currentHp ?? '—'}/{sheet.maxHp}
                </span>
              </div>
            )}
            {view.conditions.length > 0 && (
              <div className="combat-conditions">
                {view.conditions.map((c) => (
                  <span key={c} className="condition-chip">
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>
        </Panel>
      )}
      <div className="scene-token-actions">
        {onOpenSheet && (
          <button type="button" className="btn btn-primary btn-small" onClick={onOpenSheet}>
            Open Sheet
          </button>
        )}
        {isDM && view.kind === 'pc' && !inFight && (
          <button type="button" className="btn btn-ghost btn-small" onClick={() => onSetHidden(!view.hidden)}>
            {view.hidden ? 'Put Back on the Scene' : 'Take Off This Scene'}
          </button>
        )}
        {isDM && view.kind === 'npc' && (
          <ConfirmButton className="btn btn-ghost btn-small" confirmLabel="Tap again to remove" onConfirm={onRemoveWalkOn}>
            Remove
          </ConfirmButton>
        )}
        <button type="button" className="btn btn-ghost btn-small" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
