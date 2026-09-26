import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { AnnouncePanel } from '../components/AnnouncePanel.jsx';
import { Backpack } from '../components/Backpack.jsx';
import { CampaignSettings } from '../components/CampaignSettings.jsx';
import { AddCombatantForm, CombatantRow, ConditionPicker } from '../components/CombatParts.jsx';
import { ConfirmButton } from '../components/ConfirmButton.jsx';
import { InvitePanel } from '../components/InvitePanel.jsx';
import { LookupPanel } from '../components/LookupPanel.jsx';
import { MapSections, MapToolBar, MarkPanel } from '../components/MapTools.jsx';
import { PartyGlance } from '../components/PartyGlance.jsx';
import { Portrait } from '../components/Portrait.jsx';
import { BackpackIcon, MenuIcon, MomentLayer, QuickBar, RulerIcon, SceneButton, SceneSheet, SelectIcon } from '../components/SceneChrome.jsx';
import { SceneLog } from '../components/SceneLog.jsx';
import { SceneMenu } from '../components/SceneMenu.jsx';
import { MoodPanel, ScenePanel } from '../components/ScenePanels.jsx';
import { SceneStage } from '../components/SceneStage.jsx';
import { StatBlock } from '../components/StatBlock.jsx';
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
import { listEntries } from '../lib/encyclopedia.js';
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
import { centroid, formation, FORMATIONS, shiftAll, snapToGrid } from '../lib/formations.js';
import { fogOf, inFog, insideArea, isArea, MAX_FOG_STROKES } from '../lib/mapmarks.js';
import { CAPTION_MS, diffMoments, MOMENT_MS } from '../lib/moments.js';
import { moodOf } from '../lib/mood.js';
import { listNotes } from '../lib/notes.js';
import { useSceneBroadcast } from '../lib/sceneLive.js';
import {
  addMark,
  addToken,
  clearEvents,
  clearSceneBackground,
  conditionEventText,
  createScene,
  explainArtError,
  BACKDROPS,
  gridOf,
  hpEventText,
  listEvents,
  listMarks,
  listScenes,
  listTokens,
  logEvent,
  openSpot,
  partySpot,
  placeCharacter,
  pushScene,
  removeMark,
  removeScene,
  removeToken,
  SCENE_MIGRATION_HINT,
  SCENE_TABLES,
  sceneMissing,
  setSceneBackdrop,
  setSceneBackground,
  updateMark,
  updateScene,
  updateToken,
} from '../lib/scenes.js';
import { useSession } from '../lib/SessionContext.jsx';

// The Scene — a player's whole surface (BIBLE.md §1, "The companion
// principle"): the picture the DM has pushed to the table, full screen,
// with everyone standing on it. Controls hide until a tap: the menu (the
// table — Talk, the log, the campaign) and the backpack (your character —
// sheet, what you carry, the party stash). While hidden, only moments
// break through: hits, heals, conditions, arrivals, captions, "Your
// turn!". During a fight the tokens *are* the tracker, and tapping one
// opens its combat controls. The DM runs the same screen with a toolbox
// instead of a backpack, preparing scenes the players can't see yet.

const LIVE_TABLES = [
  ...SCENE_TABLES,
  'encounters',
  'encounter_combatants',
  'character_sheets',
  'character_conditions',
  'dice_rolls',
];

// Players' controls tuck themselves away after this long untouched; the
// DM's stay until dismissed (they're running the table).
const CONTROLS_MS = 5000;
const PANELS = ['menu', 'talk', 'log', 'campaign', 'invite', 'backpack', 'map', 'scene', 'mood', 'party', 'announce', 'lookup', 'fight', 'mark'];
const MENU_CHILDREN = ['talk', 'log', 'campaign', 'invite'];

const HEALTH_PCT = { Healthy: 100, Wounded: 75, Bloodied: 50, 'Near death': 25, Down: 0 };

function bandOf(pct) {
  return pct > 50 ? 'ok' : pct > 25 ? 'warn' : 'danger';
}

function describeError(err) {
  const msg = err?.message || '';
  if (/scene_marks|'fog'|"fog"/.test(msg)) {
    return 'The map tools need the latest database update — whoever runs the backend should run db/migrations/019_fog_and_marks.sql (see README).';
  }
  if (/timers|dm_only|creature_id|'size'/.test(msg)) {
    return 'That needs the latest database update — whoever runs the backend should run db/migrations/018_tokens_for_the_dm.sql (see README).';
  }
  if (/grid_(size|feet)/.test(msg)) {
    return 'The grid needs the latest database update — whoever runs the backend should run db/migrations/016_scene_grid.sql (see README).';
  }
  if (sceneMissing(err)) return SCENE_MIGRATION_HINT;
  if (err?.code === 'PGRST202' || /set_my_initiative/.test(msg) || /null value in column "initiative"/.test(msg)) {
    return 'Players rolling their own initiative needs db/migrations/006_player_initiative.sql run in Supabase first.';
  }
  return msg || 'Something went wrong.';
}

export function SceneScreen() {
  const {
    campaignId,
    campaign,
    isDM,
    isRealDM,
    isGuest,
    previewAsPlayer,
    setViewAsPlayer,
    presence,
    talk,
    worn,
    canInvite,
    resetInvite,
    onCampaignUpdated,
  } = useOutletContext();
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
  const [lore, setLore] = useState([]);
  const [notes, setNotes] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // The open token, remembered per scene so switching scenes closes it.
  const [selection, setSelection] = useState({ sceneId: null, key: null });
  const [controls, setControls] = useState(true);
  const [controlsPoke, setControlsPoke] = useState(0);
  const [measuring, setMeasuring] = useState(false);
  const [gridDraft, setGridDraft] = useState(null); // the DM adjusting the grid
  const [aspect, setAspect] = useState(4 / 3);
  // The DM picking several tokens to move (or act on) together.
  const [picking, setPicking] = useState(false);
  const [pickedState, setPickedState] = useState({ sceneId: null, keys: [] });
  const [pings, setPings] = useState([]);
  const [marks, setMarks] = useState([]);
  const [mapTool, setMapTool] = useState(null); // the DM painting fog or placing a mark
  const [markId, setMarkId] = useState(null);
  const pokeControls = () => {
    setControls(true);
    setControlsPoke((n) => n + 1);
  };

  const [params, setParams] = useSearchParams();
  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === 'panel') next.delete('thread');
    setParams(next, { replace: true });
  };
  const panel = PANELS.includes(params.get('panel')) && (params.get('panel') !== 'talk' || live) ? params.get('panel') : null;
  const openPanel = (name) => setParam('panel', name);
  const closePanel = () => setParam('panel', null);
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
    const [bestiary, log, people, entries, dmNotes, drawn] = await Promise.all([
      isDM ? listCreatures(status, campaignId).catch(() => []) : [],
      live ? listRolls(campaignId).catch(() => []) : [],
      live ? listCampaignMembers(campaignId).catch(() => []) : [],
      isDM ? listEntries(status, campaignId).catch(() => []) : [],
      isDM ? listNotes(status, campaignId).catch(() => []) : [],
      // Before 019 there are no marks yet — the scene still works.
      listMarks(status, campaignId).catch(() => []),
    ]);
    setScenes(sc);
    setTokens(tk);
    setEncounters(enc);
    setCombatants(comb);
    setSheets(sh);
    setConditions(cond);
    setEvents(ev);
    setCreatures(bestiary);
    setLore(entries);
    setNotes(dmNotes);
    setMarks(drawn);
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

  const fog = fogOf(scene);
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
  const creaturesById = Object.fromEntries(creatures.map((c) => [c.id, c]));
  for (const row of sceneTokens) {
    if (row.characterId) continue;
    // Not revealed yet: the DM's alone (RLS already keeps it from players
    // online; this covers offline and the DM previewing as a player).
    if (row.dmOnly && !isDM) continue;
    const combatant = row.combatantId ? combatantsById[row.combatantId] : null;
    if (row.combatantId && !combatant) continue;
    const creature = creaturesById[combatant?.creatureId || row.creatureId] || null;
    const extra = { size: row.size || 1, dmOnly: Boolean(row.dmOnly), creature };
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
        ...extra,
      });
    } else {
      views.push({
        ...extra,
        key: row.id,
        kind: row.creatureId ? 'monster' : 'npc',
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
  // Players aren't shown what's still in the fog: monsters, NPCs and
  // markers there are left out, not just painted over.
  if (!isDM && fog) {
    for (let i = views.length - 1; i >= 0; i -= 1) if (views[i].kind !== 'pc' && inFog(fog, views[i], aspect)) views.splice(i, 1);
  }
  const sceneMarks = scene ? marks.filter((m) => m.sceneId === scene.id && (isDM || !m.dmOnly) && (isDM || isArea(m) || !inFog(fog, m, aspect))) : [];
  // …and the turn order doesn't name what they can't see.
  const shownOrder = isDM ? ordered : ordered.filter((c) => c.isPc || views.some((v) => v.combatant?.id === c.id));
  const shownCurrent = current && !shownOrder.includes(current) ? { ...current, name: 'Something unseen' } : current;
  const openMark = sceneMarks.find((m) => m.id === markId) || null;
  const picked = new Set(pickedState.sceneId === scene?.id ? pickedState.keys.filter((k) => views.some((v) => v.key === k)) : []);
  const setPicked = (keys) => setPickedState({ sceneId: scene?.id ?? null, keys: [...keys] });
  const pickedViews = views.filter((v) => picked.has(v.key));
  const selectedKey = selection.sceneId === scene?.id ? selection.key : null;
  const setSelectedKey = (key) => setSelection({ sceneId: scene?.id ?? null, key });
  const selected = views.find((v) => v.key === selectedKey) || null;

  // ---- Controls ---------------------------------------------------------------

  // A player's controls fade after a few seconds untouched (never while a
  // sheet or token is open). The floating theme toggle and dice button
  // follow along through <html data-immersive> (index.css).
  const busy = Boolean(panel || selected || gridDraft || mapTool);
  useEffect(() => {
    if (isDM || !controls || busy) return undefined;
    const t = window.setTimeout(() => setControls(false), CONTROLS_MS);
    return () => window.clearTimeout(t);
  }, [isDM, controls, busy, controlsPoke]);

  useEffect(() => {
    const root = document.documentElement;
    // The group bar sits where the dice would, so they step aside too.
    root.dataset.immersive = busy || picking || mapTool ? 'sheet' : controls ? 'controls' : 'clean';
    if (isDM) root.dataset.dm = '';
    return () => {
      delete root.dataset.immersive;
      delete root.dataset.dm;
    };
  }, [controls, busy, isDM, picking, mapTool]);

  // ---- Measuring ----------------------------------------------------------------

  // The DM's line goes out live to the table (lib/sceneLive.js), a few
  // times a second at most — always ending on where the finger stopped —
  // and nothing is stored. Players show the latest line for this scene
  // until the DM clears it (or it goes quiet).
  const [heardLine, setHeardLine] = useState(null);
  const heardTimer = useRef(null);
  const sendToTable = useSceneBroadcast(live, campaignId, ['measure', 'ping'], (event, payload) => {
    if (event === 'ping') {
      if (payload?.sceneId === lastSnapshot.current?.sceneId) showPing(payload);
      return;
    }
    if (event !== 'measure') return;
    window.clearTimeout(heardTimer.current);
    setHeardLine(payload?.line ? payload : null);
    if (payload?.line) heardTimer.current = window.setTimeout(() => setHeardLine(null), 4000);
  });
  const outgoing = useRef({ at: 0, timer: null, line: null });
  function shareLine(line) {
    if (!live || !scene?.active) return;
    const o = outgoing.current;
    o.line = line;
    window.clearTimeout(o.timer);
    const wait = line ? Math.max(0, 80 - (Date.now() - o.at)) : 0;
    o.timer = window.setTimeout(() => {
      o.at = Date.now();
      sendToTable('measure', { sceneId: scene.id, line: o.line });
    }, wait);
  }
  const shownGrid = gridDraft || gridOf(scene);

  // A ping: a ripple on everyone's scene where the DM held a finger down.
  function showPing(spot) {
    const id = `${Date.now()}-${Math.random()}`;
    setPings((prev) => [...prev.slice(-4), { id, x: spot.x, y: spot.y }]);
    window.setTimeout(() => setPings((prev) => prev.filter((p) => p.id !== id)), 2200);
  }
  function ping(spot) {
    showPing(spot);
    navigator.vibrate?.(30);
    if (live && scene?.active) sendToTable('ping', { sceneId: scene.id, x: spot.x, y: spot.y });
  }
  const heard = heardLine && heardLine.sceneId === scene?.id ? heardLine.line : null;

  function saveGrid(grid) {
    act(() => updateScene(status, campaignId, scene.id, grid ? { gridSize: grid.size, gridFeet: grid.feet } : { gridSize: null }));
    setGridDraft(null);
    if (!grid) setMeasuring(false);
  }

  // ---- Moments ----------------------------------------------------------------

  // What's on screen, reduced to what moments care about. Compared with
  // the previous one after every refetch (lib/moments.js).
  const snapshotKey = !loading
    ? JSON.stringify({
        sceneId: scene?.id ?? null,
        tokens: Object.fromEntries(
          views.map((v) => {
            const hp = v.kind === 'pc' ? (v.sheet.currentHp ?? null) : v.combatant ? (v.combatant.currentHp ?? null) : null;
            const band = v.kind === 'monster' && v.combatant ? healthDescriptor(v.combatant.currentHp, v.combatant.maxHp) : null;
            return [v.key, { hp, exact: isDM || v.kind === 'pc', band, conditions: v.conditions }];
          }),
        ),
        currentKey: views.find((v) => v.isCurrent)?.key || null,
        mineCurrent: Boolean(myTurn),
        lines: [
          ...events.map((e) => ({ id: `e:${e.id}`, text: e.text, style: e.style, body: e.body, aimed: Boolean(e.toUser), at: e.createdAt })),
          ...rolls.map((r) => ({ id: `r:${r.id}`, text: `${r.displayName} rolled ${r.expression}: ${r.total}`, at: r.createdAt })),
        ].sort((a, b) => b.at.localeCompare(a.at)),
      })
    : '';
  const lastSnapshot = useRef(null);
  const momentSeq = useRef(0);
  const [tokenMoments, setTokenMoments] = useState({});
  const [captions, setCaptions] = useState([]);
  const [yourTurn, setYourTurn] = useState(0);
  const [call, setCall] = useState(null);
  const [titleCard, setTitleCard] = useState(null);
  const [handout, setHandout] = useState(null);
  const [handoutDraft, setHandoutDraft] = useState(null);

  useEffect(() => {
    const next = snapshotKey ? JSON.parse(snapshotKey) : null;
    const diff = diffMoments(lastSnapshot.current, next);
    lastSnapshot.current = next;
    for (const m of diff.tokens) {
      const id = (momentSeq.current += 1);
      setTokenMoments((prev) => ({ ...prev, [m.key]: [...(prev[m.key] || []), { ...m, id }] }));
      window.setTimeout(() => {
        setTokenMoments((prev) => ({ ...prev, [m.key]: (prev[m.key] || []).filter((x) => x.id !== id) }));
      }, MOMENT_MS);
    }
    for (const text of diff.captions) {
      const id = (momentSeq.current += 1);
      setCaptions((prev) => [...prev.slice(-2), { id, text }]);
      window.setTimeout(() => setCaptions((prev) => prev.filter((c) => c.id !== id)), CAPTION_MS);
    }
    for (const a of diff.announcements) {
      const id = (momentSeq.current += 1);
      if (a.style === 'call') {
        setCall({ id, text: a.text, aimed: a.aimed });
        navigator.vibrate?.(a.aimed ? [90, 50, 90] : 80);
        window.setTimeout(() => setCall((cur) => (cur?.id === id ? null : cur)), 4200);
      } else if (a.style === 'title') {
        setTitleCard({ id, text: a.text, body: a.body });
        window.setTimeout(() => setTitleCard((cur) => (cur?.id === id ? null : cur)), 5200);
      } else if (a.style === 'handout') {
        setHandout({ text: a.text, body: a.body, aimed: a.aimed });
      }
    }
    if (diff.yourTurn) {
      const id = (momentSeq.current += 1);
      setYourTurn(id);
      navigator.vibrate?.([120, 60, 120]);
      window.setTimeout(() => setYourTurn((cur) => (cur === id ? 0 : cur)), MOMENT_MS + 400);
    }
  }, [snapshotKey]);


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

  // Moves [{ view, x, y }] at once — one token, or the DM's picked group.
  function placeMany(moves) {
    if (!scene || moves.length === 0) return;
    setTokens((prev) => {
      let next = prev;
      for (const { view, x, y } of moves) {
        next = view.row
          ? next.map((t) => (t.id === view.row.id ? { ...t, x, y } : t))
          : [...next, { id: `pending-${view.key}`, sceneId: scene.id, characterId: view.sheet.id, x, y, hidden: false }];
      }
      return next;
    });
    act(() =>
      Promise.all(
        moves.map(({ view, x, y }) =>
          view.kind === 'pc'
            ? placeCharacter(status, campaignId, { sceneId: scene.id, characterId: view.sheet.id, x, y, asDM: isDM, existing: view.row })
            : updateToken(status, campaignId, view.row.id, { x, y }),
        ),
      ),
    );
  }

  // A dropped token; if it's one of the DM's picked group, they all move
  // by the same amount.
  function moveToken(key, x, y) {
    const view = views.find((v) => v.key === key);
    if (!view) return;
    if (!picked.has(key) || picked.size < 2) {
      placeMany([{ view, x, y }]);
      return;
    }
    const moved = shiftAll(pickedViews, x - view.x, y - view.y);
    placeMany(moved.map((m) => ({ view: m, x: m.key === key ? x : m.x, y: m.key === key ? y : m.y })));
  }

  // The picked group, walked to where the DM tapped — same shape, snapped.
  function moveGroupTo(spot) {
    if (pickedViews.length === 0) return;
    const c = centroid(pickedViews);
    const grid = gridOf(scene);
    placeMany(
      shiftAll(pickedViews, spot.x - c.x, spot.y - c.y).map((m) => ({ view: m, ...snapToGrid({ x: m.x, y: m.y }, grid, aspect, m.size || 1) })),
    );
  }

  function arrange(kind) {
    if (pickedViews.length === 0) return;
    const spots = formation(kind, pickedViews.length, centroid(pickedViews), gridOf(scene), aspect);
    placeMany(pickedViews.map((view, i) => ({ view, ...spots[i] })));
  }

  const togglePick = (key) => setPicked(picked.has(key) ? [...picked].filter((k) => k !== key) : [...picked, key]);

  // ---- Scenes, mood and announcements (DM) ------------------------------------

  // Going to a scene from the Scene sheet: look at it, or (showNow) put
  // it in front of the table at once.
  async function openScene(target, showNow) {
    const next = new URLSearchParams(params);
    next.set('scene', target.id);
    next.delete('panel');
    setParams(next, { replace: true });
    if (showNow && !target.active) {
      await act(async () => {
        await pushScene(status, campaignId, target.id);
        await logEvent(status, campaignId, { sceneId: target.id, kind: 'auto', text: `The scene changes: ${target.name}.` }).catch(() => {});
      });
    }
  }

  async function createSceneFrom(name, backdropId, showNow) {
    const taken = new Set(scenes.map((s) => s.name));
    let unique = name;
    for (let n = 2; taken.has(unique); n += 1) unique = `${name} ${n}`;
    let created = null;
    const ok = await act(async () => {
      created = await createScene(status, campaignId, unique, backdropId ? `builtin:${backdropId}` : null);
    });
    if (ok && created) await openScene(created, showNow);
  }

  const setMood = (mood) => act(() => updateScene(status, campaignId, scene.id, { mood }));

  // Announcements go to the table whatever scene the DM happens to be
  // looking at — they belong with the live one.
  const announce = ({ style, text, body = null, toUser = null }) =>
    act(() => logEvent(status, campaignId, { sceneId: liveScene?.id ?? null, kind: 'manual', style, text, body, toUser }));

  function handOut(draft) {
    setHandoutDraft(draft);
    openPanel('announce');
  }

  function addCreatureToFight(creature, count) {
    const dex = abilityMod(creature.abilities?.dex);
    const hp = creature.hitPoints ?? null;
    const entries = Array.from({ length: count }, (_, i) => ({
      name: count > 1 ? `${creature.name} ${i + 1}` : creature.name,
      isPc: false,
      characterId: null,
      dexModifier: dex,
      initiative: rollInitiative(dex),
      armorClass: creature.armorClass ?? null,
      maxHp: hp,
      currentHp: hp,
      creatureId: creature.id,
    }));
    closePanel();
    return addToFight(entries);
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
      for (const v of views.filter((x) => x.kind === 'monster' && !x.combatant && !x.dmOnly)) await enlist(v, created.id);
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
      const newRound = direction > 0 && patch.round > (fightHere.round ?? 1);
      // Conditions whose time is up come off as the new round starts.
      const timers = fightHere.timers || [];
      const expired = newRound ? timers.filter((t) => t.until <= patch.round) : [];
      await updateEncounter(status, campaignId, fightHere.id, expired.length ? { ...patch, timers: timers.filter((t) => !expired.includes(t)) } : patch);
      if (newRound) await note(`Round ${patch.round} begins.`);
      for (const t of expired) {
        const view = views.find((v) => timerKey(v) === t.key);
        if (!view) continue;
        if (view.kind === 'pc') {
          const row = (conditionsByCharacter[view.sheet.id] || []).find((c) => c.label === t.label);
          if (row) await removeCondition(status, campaignId, row.id);
        } else {
          const latest = combatantsById[view.combatant.id];
          await updateCombatant(status, campaignId, latest.id, { conditions: (latest.conditions || []).filter((c) => c !== t.label) });
        }
        await note(conditionEventText(view.name, t.label, false));
      }
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
  // Damage (negative) or healing for one token or several — a Fireball on
  // four goblins is one tap. Tokens with no HP (a walk-on, a monster
  // that hasn't joined a fight) are skipped.
  async function hpWrite(view, amount) {
    if (view.kind === 'pc') {
      const sheet = view.sheet;
      const patch = hpPatch(sheet, amount);
      await updateSheet(status, campaignId, sheet.id, patch);
      await note(hpEventText(sheet.name, sheet.currentHp ?? 0, patch.currentHp, sheet.maxHp));
    } else if (view.combatant) {
      const c = view.combatant;
      const patch = combatantHpPatch(c, amount);
      await updateCombatant(status, campaignId, c.id, patch);
      await note(hpEventText(c.name, c.currentHp ?? 0, patch.currentHp, c.maxHp));
    }
  }
  const applyHp = (view, amount) => act(() => hpWrite(view, amount));
  const applyHpMany = (targets, amount) =>
    act(async () => {
      for (const v of targets) await hpWrite(v, amount);
    });

  function setInitiative(combatant, value) {
    act(() =>
      isDM ? updateCombatant(status, campaignId, combatant.id, { initiative: value }) : setOwnInitiative(status, campaignId, combatant.id, value),
    );
  }

  // Conditions, optionally for so many rounds: the timer lives on the
  // encounter (018: encounters.timers) and step() takes it off again.
  const timerKey = (view) => (view.kind === 'pc' ? `pc:${view.sheet.id}` : view.combatant ? `c:${view.combatant.id}` : null);

  async function conditionWrite(view, label) {
    if (view.kind === 'pc') {
      if ((conditionsByCharacter[view.sheet.id] || []).some((c) => c.label === label)) return false;
      await addCondition(status, campaignId, { characterId: view.sheet.id, label, note: '', visibleToParty: true });
    } else if (view.combatant) {
      if ((view.combatant.conditions || []).includes(label)) return false;
      await updateCombatant(status, campaignId, view.combatant.id, { conditions: [...(view.combatant.conditions || []), label] });
    } else {
      return false;
    }
    await note(conditionEventText(view.name, label, true));
    return true;
  }

  async function addTimers(targets, label, rounds) {
    if (!rounds || !fightHere) return;
    const until = (fightHere.round ?? 1) + rounds;
    const added = targets.map(timerKey).filter(Boolean).map((key) => ({ key, label, until }));
    if (added.length === 0) return;
    const kept = (fightHere.timers || []).filter((t) => !added.some((a) => a.key === t.key && a.label === t.label));
    await updateEncounter(status, campaignId, fightHere.id, { timers: [...kept, ...added] });
  }

  const addConditionTo = (view, label, rounds) =>
    act(async () => {
      await conditionWrite(view, label);
      await addTimers([view], label, rounds);
    });

  const addConditionMany = (targets, label, rounds) =>
    act(async () => {
      for (const v of targets) await conditionWrite(v, label);
      await addTimers(targets, label, rounds);
    });

  // Rounds left on each of a token's timed conditions: { label: rounds }.
  function timersOf(view) {
    const key = timerKey(view);
    if (!fightHere || !key) return {};
    return Object.fromEntries((fightHere.timers || []).filter((t) => t.key === key).map((t) => [t.label, t.until - (fightHere.round ?? 1)]));
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

  // ---- The map: fog of war, markers, spell areas (019) -------------------

  function saveFog(next) {
    if (next && next.strokes.length > MAX_FOG_STROKES) {
      setError('That’s a lot of painting for one map — cover it again and repaint in bigger strokes.');
      return;
    }
    setScenes((prev) => prev.map((x) => (x.id === scene.id ? { ...x, fog: next } : x)));
    act(() => updateScene(status, campaignId, scene.id, { fog: next }));
  }
  const paintFog = (stroke) => fog && saveFog({ on: true, strokes: [...fog.strokes, stroke] });

  function placeMark(spot) {
    const { preset, hidden } = mapTool;
    setMapTool(null);
    act(async () => {
      const created = await addMark(status, campaignId, {
        sceneId: scene.id,
        kind: preset.kind,
        x: spot.x,
        y: spot.y,
        angle: spot.angle,
        sizeFt: preset.sizeFt || 5,
        label: preset.label || null,
        color: preset.color || null,
        dmOnly: hidden,
      });
      if (preset.kind === 'label') openPanelForMark(created.id);
    });
  }

  function openPanelForMark(id) {
    setMarkId(id);
    openPanel('mark');
  }

  const changeMark = (patch) => act(() => updateMark(status, campaignId, openMark.id, patch));

  function revealMark(revealed) {
    const m = openMark;
    act(async () => {
      await updateMark(status, campaignId, m.id, { dmOnly: !revealed });
      if (revealed) await note(`${m.label || (m.kind === 'trap' ? 'A trap' : m.kind === 'door' ? 'A door' : m.kind === 'loot' ? 'Something glinting' : 'Something')} is revealed!`);
    });
  }

  function dropMark() {
    const id = openMark.id;
    closePanel();
    act(() => removeMark(status, campaignId, id));
  }

  // Everyone standing in a spell area, picked — ready for "Damage all".
  function pickInside(mark) {
    const inside = views.filter((v) => !v.hidden && insideArea(mark, v, gridOf(scene), aspect)).map((v) => v.key);
    setPicked(inside);
    setPicking(true);
    closePanel();
  }

  function addWalkOn(label, hidden = false) {
    return act(async () => {
      await addToken(status, campaignId, {
        sceneId: scene.id,
        label,
        ...(hidden ? { dmOnly: true } : {}),
        ...openSpot(views.map((v) => ({ x: v.x, y: v.y }))),
      });
      if (!hidden) await note(`${label} appears.`);
    });
  }

  // A monster placed from the Bestiary before (or outside) a fight joins
  // one with its stats: a combatant is made and its token points at it.
  async function enlist(view, encounterId) {
    const c = view.creature;
    const dex = abilityMod(c?.abilities?.dex);
    const hp = c?.hitPoints ?? null;
    const created = await addCombatant(status, campaignId, {
      encounterId,
      name: view.name,
      isPc: false,
      characterId: null,
      dexModifier: dex,
      initiative: rollInitiative(dex),
      armorClass: c?.armorClass ?? null,
      maxHp: hp,
      currentHp: hp,
      ...(c ? { creatureId: c.id } : {}),
    });
    await updateToken(status, campaignId, view.row.id, { combatantId: created.id });
  }

  // Placing monsters from the Bestiary: hidden (an ambush waiting to be
  // revealed) or in plain sight — and straight into the fight if one's on.
  function placeCreatures(creature, count, hidden) {
    closePanel();
    return act(async () => {
      const taken = views.map((v) => ({ x: v.x, y: v.y }));
      for (let i = 0; i < count; i += 1) {
        const spot = openSpot(taken);
        taken.push(spot);
        const name = count > 1 ? `${creature.name} ${i + 1}` : creature.name;
        const row = await addToken(status, campaignId, {
          sceneId: scene.id,
          label: name,
          creatureId: creature.id,
          ...(hidden ? { dmOnly: true } : {}),
          ...spot,
        });
        if (!hidden && fightHere) await enlist({ name, creature, row }, fightHere.id);
      }
      if (!hidden) await note(`${count > 1 ? `${count} × ${creature.name}` : creature.name} ${count > 1 ? 'appear' : 'appears'}.`);
    });
  }

  // Revealing (or hiding again) tokens the players can't see yet. A
  // revealed monster joins a fight that's already on.
  function setRevealed(targets, revealed) {
    const list = targets.filter((v) => v.kind !== 'pc' && v.dmOnly === revealed);
    if (list.length === 0) return;
    act(async () => {
      for (const v of list) {
        await updateToken(status, campaignId, v.row.id, { dmOnly: !revealed });
        if (revealed && fightHere && !v.combatant && v.kind === 'monster') await enlist(v, fightHere.id);
      }
      if (revealed) await note(list.length > 1 ? `${list.map((v) => v.name).join(', ')} appear!` : `${list[0].name} appears!`);
    });
  }

  const setSize = (view, size) => act(() => updateToken(status, campaignId, view.row.id, { size }));

  function removeWalkOn(view) {
    act(() => removeToken(status, campaignId, view.row.id));
    setSelectedKey(null);
  }

  // ---- Render -----------------------------------------------------------------

  if (loading) return <div className="scene-loading">Setting the scene…</div>;

  const sheetPath = (sheet) => `/campaigns/${campaignId}/characters/${sheet.id}`;
  const tabPath = (tab) => `/campaigns/${campaignId}/${tab}`;
  const unreadTalk = talk?.totalUnread || 0;
  const playerName = (userId) => {
    const person = members.find((m) => m.userId === userId);
    const name = person?.displayName || 'a player';
    return worn?.[userId] ? `${worn[userId]} (${name})` : name;
  };
  const findCharacter = () => navigate(isGuest ? tabPath('characters') : `/campaigns/${campaignId}/choose`);

  const menuItems = [
    live && { key: 'talk', label: 'Talk', badge: unreadTalk, onClick: () => openPanel('talk') },
    { key: 'log', label: 'What happened', onClick: () => openPanel('log') },
    ...(isDM
      ? [
          { key: 'party', label: 'Party', onClick: () => navigate(tabPath('characters')) },
          { key: 'lore', label: 'Lore', onClick: () => navigate(tabPath('encyclopedia')) },
          { key: 'monsters', label: 'Monsters', onClick: () => navigate(tabPath('bestiary')) },
          { key: 'notes', label: 'Notes', onClick: () => navigate(tabPath('notes')) },
          canInvite && { key: 'invite', label: 'Invite players', onClick: () => openPanel('invite') },
        ]
      : [
          !isGuest && !isRealDM && {
            key: 'choose',
            label: myCharacter ? 'Change character' : 'Choose a character',
            onClick: findCharacter,
          },
        ]),
    { key: 'campaign', label: isRealDM ? 'Campaign settings' : 'This campaign', onClick: () => openPanel('campaign') },
    isRealDM && {
      key: 'view-as',
      label: previewAsPlayer ? 'Back to DM view' : 'View as a player',
      onClick: () => {
        setViewAsPlayer(!previewAsPlayer);
        closePanel();
      },
    },
    { key: 'home', label: 'All campaigns', onClick: () => navigate('/dashboard') },
  ].filter(Boolean);

  const panelTitles = {
    menu: campaign?.name || 'Menu',
    talk: 'Talk',
    log: 'What happened',
    campaign: isRealDM ? 'Campaign settings' : 'This campaign',
    invite: 'Invite players',
    backpack: 'Backpack',
    map: 'Map',
    mark: openMark?.label || 'Mark',
    scene: 'Scene',
    mood: 'Mood',
    party: 'Party at a glance',
    announce: 'Announce',
    lookup: 'Look up',
    fight: 'Fight',
  };

  return (
    <div className={`scene-screen${controls ? ' controls' : ''}`}>
      <SceneStage
        artPath={scene?.backgroundPath ?? null}
        tokens={views}
        selectedKey={selectedKey}
        showInfo={controls}
        moments={tokenMoments}
        grid={shownGrid}
        mood={moodOf(scene)}
        lights={views.filter((v) => v.kind === 'pc' && !v.hidden).map((v) => ({ key: v.key, x: v.x, y: v.y }))}
        isDM={isDM}
        measuring={isDM && measuring && Boolean(shownGrid)}
        measure={heard}
        onMeasure={shareLine}
        picked={picked}
        pings={pings}
        marks={sceneMarks}
        fog={fog}
        mapTool={isDM ? mapTool : null}
        onPaint={paintFog}
        onPlaceMark={placeMark}
        onMarkTap={isDM ? (m) => openPanelForMark(m.id) : null}
        onAspect={setAspect}
        onPing={isDM ? ping : null}
        onSelect={(key) => {
          if (picking && key) togglePick(key);
          else setSelectedKey(key);
          pokeControls();
        }}
        onMove={(key, x, y) => {
          moveToken(key, x, y);
          pokeControls();
        }}
        onBackground={(spot) => {
          if (picking && picked.size > 0) moveGroupTo(spot);
          else if (!picking && controls) setControls(false);
          else if (!picking) pokeControls();
        }}
      />

      {!scene && (
        <div className="scene-empty">
          <h2>{isDM ? 'Set the scene' : 'No scene yet'}</h2>
          <p>
            {isDM
              ? 'Make a scene — the tavern, the forest road, the dungeon room — give it a picture, then show it to your players.'
              : isGuest
                ? 'In offline play the DM runs the scene on their own device.'
                : 'When the DM shows a scene, it appears here.'}
          </p>
          {isDM && (
            <button type="button" className="btn btn-primary" onClick={() => openPanel('toolbox')}>
              Open the Toolbox
            </button>
          )}
        </div>
      )}

      <MomentLayer captions={captions} yourTurn={yourTurn} call={call} titleCard={titleCard} handout={handout} onCloseHandout={() => setHandout(null)} />

      {controls && (
        <>
          <div className="scene-top">
            <div className="scene-top-title">
              <h1>{scene?.name || campaign?.name}</h1>
              {isDM && scene && (scene.active ? <span className="chip chip-small scene-live-chip">Live</span> : <span className="chip chip-small">Only you can see this</span>)}
              {previewAsPlayer && <span className="chip chip-small scene-live-chip">Player view</span>}
            </div>
            <div className="scene-top-actions">
              {isDM && scene && (
                <SceneButton
                  label={picking ? 'Done picking' : 'Pick tokens'}
                  active={picking}
                  onClick={() => {
                    setPicking((p) => !p);
                    setMeasuring(false);
                    if (picking) setPicked([]);
                  }}
                >
                  <SelectIcon />
                </SceneButton>
              )}
              {isDM && gridOf(scene) && (
                <SceneButton
                  label={measuring ? 'Stop measuring' : 'Measure'}
                  active={measuring}
                  onClick={() => {
                    setMeasuring((m) => !m);
                    setPicking(false);
                  }}
                >
                  <RulerIcon />
                </SceneButton>
              )}
              <SceneButton label="Menu" badge={unreadTalk} onClick={() => openPanel('menu')}>
                <MenuIcon />
              </SceneButton>
              {isDM && measuring && gridOf(scene) && <span className="scene-mode-chip">Drag across the scene to measure</span>}
            </div>
          </div>

          {fightHere && (
            <FightBar
              fight={fightHere}
              ordered={shownOrder}
              current={shownCurrent}
              isDM={isDM}
              myTurn={myTurn}
              myUnrolled={myUnrolled}
              onBegin={beginCombat}
              onStep={step}
              onEnd={endFight}
              onPick={(c) => setSelectedKey(c.isPc ? `pc:${c.characterId}` : views.find((v) => v.combatant?.id === c.id)?.key || null)}
            />
          )}

          {isDM && mapTool && <MapToolBar tool={mapTool} onChange={setMapTool} onDone={() => setMapTool(null)} />}

          {isDM && picking && !mapTool && (
            <GroupBar
              count={picked.size}
              canHurt={pickedViews.some((v) => v.kind === 'pc' || v.combatant)}
              onHp={(amount) => applyHpMany(pickedViews, amount)}
              onCondition={(label, rounds) => addConditionMany(pickedViews, label, rounds)}
              fightOn={Boolean(fightHere)}
              anyHidden={pickedViews.some((v) => v.dmOnly)}
              onParty={() => setPicked(views.filter((v) => v.kind === 'pc' && !v.hidden).map((v) => v.key))}
              onArrange={arrange}
              onReveal={() => setRevealed(pickedViews, true)}
              onClear={() => setPicked([])}
            />
          )}

          {isDM ? (
            <QuickBar active={panel} fightOn={Boolean(fightHere)} onPick={(id) => openPanel(id)} />
          ) : (
            <div className="scene-bottom">
              <SceneButton label="Backpack" onClick={() => openPanel('backpack')}>
                <BackpackIcon />
              </SceneButton>
            </div>
          )}
        </>
      )}

      {gridDraft && isDM && scene && (
        <GridEditor
          draft={gridDraft}
          hasGrid={Boolean(gridOf(scene))}
          onChange={setGridDraft}
          onSave={() => saveGrid(gridDraft)}
          onRemove={() => saveGrid(null)}
          onCancel={() => setGridDraft(null)}
        />
      )}

      {error && (
        <p className="scene-error" role="alert" onClick={() => setError(null)}>
          {error}
        </p>
      )}

      {selected && (
        <SceneSheet title={selected.name} onClose={() => setSelectedKey(null)}>
          <TokenPanel
            view={selected}
            inFight={Boolean(fightHere && selected.combatant && selected.combatant.encounterId === fightHere.id)}
            isCurrent={selected.isCurrent}
            isDM={isDM}
            pcConditions={selected.kind === 'pc' ? conditionsByCharacter[selected.sheet.id] || [] : null}
            canEditHp={isDM || (selected.kind === 'pc' && ownsSheet(selected.sheet))}
            canEditInitiative={isDM || (selected.kind === 'pc' && isMyCharacter(selected.sheet))}
            onOpenSheet={selected.kind === 'pc' ? () => navigate(sheetPath(selected.sheet)) : null}
            onHp={(amount) => applyHp(selected, amount)}
            onInitiative={(value) => setInitiative(selected.combatant, value)}
            onRollInitiative={() => setInitiative(selected.combatant, rollInitiative(selected.combatant.dexModifier))}
            onRemoveFromFight={() => removeFromFight(selected.combatant)}
            onAddCondition={(label, rounds) => addConditionTo(selected, label, rounds)}
            timers={timersOf(selected)}
            onRemoveCondition={(c) => removeConditionFrom(selected, c)}
            onSetHidden={(hidden) => setPcHidden(selected, hidden)}
            onRemoveWalkOn={() => removeWalkOn(selected)}
            onReveal={(revealed) => setRevealed([selected], revealed)}
            onSize={(size) => setSize(selected, size)}
          />
        </SceneSheet>
      )}

      {panel && (
        <SceneSheet title={panelTitles[panel]} onClose={closePanel} onBack={MENU_CHILDREN.includes(panel) ? () => openPanel('menu') : undefined}>
          {panel === 'menu' && <SceneMenu items={menuItems} />}

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

          {panel === 'log' && (
            <SceneLog
              events={events}
              rolls={rolls}
              scenesById={scenesById}
              currentSceneId={scene?.id ?? null}
              isDM={isDM}
              nameOf={playerName}
              onPost={postLine}
              onClear={clearLog}
              onOpenHandout={(item) => {
                closePanel();
                setHandout({ text: item.text, body: item.body, aimed: Boolean(item.toUser) });
              }}
            />
          )}

          {panel === 'campaign' && campaign && (
            <CampaignSettings campaign={campaign} isDM={isRealDM} isGuest={isGuest} onUpdated={onCampaignUpdated} onClose={closePanel} />
          )}

          {panel === 'invite' && canInvite && (
            <InvitePanel code={campaign.invite_code} campaignName={campaign.name} onClose={closePanel} onReset={resetInvite} />
          )}

          {panel === 'backpack' && (
            <Backpack
              character={myCharacter}
              conditions={myCharacter ? conditionsByCharacter[myCharacter.id] || [] : []}
              status={status}
              campaignId={campaignId}
              characterNames={sheets.map((s) => s.name)}
              onOpenSheet={() => navigate(sheetPath(myCharacter))}
              onFindCharacter={findCharacter}
              findLabel={isGuest ? (myCharacter ? null : 'Create My Character') : myCharacter ? 'Change Character' : 'Choose a Character'}
              onPatch={(patch) => act(() => updateSheet(status, campaignId, myCharacter.id, patch))}
            />
          )}

          {panel === 'scene' && isDM && (
            <ScenePanel scenes={orderedScenes} current={scene} onOpen={openScene} onCreate={createSceneFrom} />
          )}

          {panel === 'mood' && isDM && (
            scene ? (
              <MoodPanel mood={moodOf(scene)} sceneLive={scene.active} onChange={setMood} />
            ) : (
              <p className="hint-text">Set a scene first — the mood is laid over its picture.</p>
            )
          )}

          {panel === 'announce' && isDM && (
            <AnnouncePanel
              key={handoutDraft ? `h-${handoutDraft.text}` : 'announce'}
              campaignId={campaignId}
              players={members.filter((m) => m.role === 'player').map((m) => ({ userId: m.userId, label: playerName(m.userId) }))}
              lore={lore}
              handoutDraft={handoutDraft}
              onSend={announce}
            />
          )}

          {panel === 'party' && isDM && (
            <PartyGlance
              party={views.filter((v) => v.kind === 'pc').map((v) => ({ key: v.key, sheet: v.sheet }))}
              conditionsByCharacter={conditionsByCharacter}
              onOpen={(key) => {
                closePanel();
                setSelectedKey(key);
              }}
            />
          )}

          {panel === 'lookup' && isDM && (
            <LookupPanel
              lore={lore}
              creatures={creatures}
              notes={notes}
              fightOn={Boolean(fightHere)}
              onHandout={handOut}
              onAddToFight={addCreatureToFight}
              onPlace={scene ? placeCreatures : null}
              onOpenTab={(tab) => navigate(tabPath(tab))}
            />
          )}

          {panel === 'fight' && isDM && (
            <div className="toolbox">
              {!scene ? (
                <p className="hint-text">Set a scene first — the fight happens on it.</p>
              ) : fightHere ? (
                <>
                  <p className="hint-text" style={{ margin: 0 }}>
                    <strong>{fightHere.name}</strong> — turn controls sit at the top of the scene; tap a token for its HP, initiative and conditions. Monsters
                    from your Bestiary are also one tap away in Look up.
                  </p>
                  <AddCombatantForm
                    creatures={creatures}
                    availableSheets={sheets.filter((s) => !ordered.some((c) => c.characterId === s.id))}
                    onAdd={addToFight}
                  />
                </>
              ) : fightElsewhere ? (
                <div className="scene-fight-elsewhere">
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
                </div>
              ) : (
                <StartFight onStart={startFight} />
              )}
            </div>
          )}

          {panel === 'mark' && isDM && openMark && (
            <MarkPanel key={openMark.id} mark={openMark} onChange={changeMark} onRemove={dropMark} onReveal={revealMark} onPickInside={() => pickInside(openMark)} />
          )}

          {panel === 'map' && isDM && (
            <div className="toolbox">
              {scene ? (
                <section>
                  <h4>This scene</h4>
                  <SceneTools
                    key={scene.id}
                    scene={scene}
                    status={status}
                    campaignId={campaignId}
                    onRename={(name) => act(() => updateScene(status, campaignId, scene.id, { name }))}
                    onBackdrop={(id) => act(() => setSceneBackdrop(status, campaignId, scene, id))}
                    onChanged={() => refresh().catch(() => {})}
                    onAddWalkOn={addWalkOn}
                    onDelete={() =>
                      act(async () => {
                        await removeScene(status, campaignId, scene);
                        setParam('scene', null);
                      })
                    }
                  />
                </section>
              ) : (
                <p className="hint-text">Pick or make a scene from Scene in the quick bar first.</p>
              )}

              {scene && (
                <section>
                  <h4>Grid</h4>
                  <p className="hint-text" style={{ margin: 0 }}>
                    {gridOf(scene)
                      ? `Squares of ${gridOf(scene).feet} ft. Measure with the ruler at the top — the table sees the line as you draw it.`
                      : 'Lay a grid over the picture to measure distances in feet.'}
                  </p>
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    style={{ alignSelf: 'flex-start' }}
                    onClick={() => {
                      setGridDraft(gridOf(scene) || { size: 0.05, feet: 5 });
                      closePanel();
                    }}
                  >
                    {gridOf(scene) ? 'Adjust the Grid' : 'Set Up a Grid'}
                  </button>
                </section>
              )}

              {scene && (
                <MapSections
                  fog={fog}
                  hasGrid={Boolean(gridOf(scene))}
                  onFog={saveFog}
                  onTool={(tool) => {
                    setMapTool(tool);
                    setPicking(false);
                    setMeasuring(false);
                    closePanel();
                  }}
                />
              )}
            </div>
          )}
        </SceneSheet>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------

function SceneTools({ scene, status, campaignId, onRename, onBackdrop, onChanged, onAddWalkOn, onDelete }) {
  const [name, setName] = useState(scene.name);
  const [walkOn, setWalkOn] = useState('');
  const [walkOnHidden, setWalkOnHidden] = useState(false);
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
    <div className="scene-tools">
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
          {busy ? 'Working…' : 'Upload My Own Picture'}
        </button>
        <select
          className="scene-tools-select"
          value={scene.backgroundPath?.startsWith('builtin:') ? scene.backgroundPath.slice(8) : ''}
          onChange={(e) => e.target.value && onBackdrop(e.target.value)}
          aria-label="Built-in backdrop"
          disabled={busy}
        >
          <option value="">Built-in backdrop…</option>
          {BACKDROPS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
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
          if (walkOn.trim() && (await onAddWalkOn(walkOn.trim().slice(0, 120), walkOnHidden))) setWalkOn('');
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
      <label className="lookup-check">
        <input type="checkbox" checked={walkOnHidden} onChange={(e) => setWalkOnHidden(e.target.checked)} />
        Hidden until I reveal them
      </label>
      <p className="hint-text" style={{ margin: 0 }}>
        For someone who might fight, start a fight and add them from the Bestiary instead — they get HP and initiative.
      </p>

      <div className="scene-tools-row" style={{ justifyContent: 'flex-end' }}>
        <ConfirmButton className="btn btn-ghost btn-small" confirmLabel="Tap again to delete" onConfirm={onDelete}>
          Delete Scene
        </ConfirmButton>
      </div>
    </div>
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
const SIZES = [
  { n: 1, name: 'Medium' },
  { n: 2, name: 'Large' },
  { n: 3, name: 'Huge' },
  { n: 4, name: 'Gargantuan' },
];

function TokenPanel({
  view,
  inFight,
  isCurrent,
  isDM,
  pcConditions,
  canEditHp,
  canEditInitiative,
  onOpenSheet,
  onHp,
  onInitiative,
  onRollInitiative,
  onRemoveFromFight,
  onAddCondition,
  onRemoveCondition,
  onSetHidden,
  onRemoveWalkOn,
  onReveal,
  onSize,
  timers,
}) {
  const sheet = view.sheet;
  const token = view.kind !== 'pc';
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
          timers={timers}
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
      {isDM && view.dmOnly && <p className="scene-token-hidden-note">Hidden — only you can see this. Reveal it when the table should.</p>}
      {isDM && view.creature && <StatBlock creature={view.creature} />}
      {isDM && token && (
        <div className="scene-token-size" role="radiogroup" aria-label="Size">
          {SIZES.map((sz) => (
            <button
              key={sz.n}
              type="button"
              role="radio"
              aria-checked={(view.size || 1) === sz.n}
              className={`preset-chip${(view.size || 1) === sz.n ? ' active' : ''}`}
              onClick={() => onSize(sz.n)}
            >
              {sz.name}
            </button>
          ))}
        </div>
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
        {isDM && token && (
          <button type="button" className={`btn btn-small ${view.dmOnly ? 'btn-primary' : 'btn-ghost'}`} onClick={() => onReveal(view.dmOnly)}>
            {view.dmOnly ? 'Reveal to Players' : 'Hide from Players'}
          </button>
        )}
        {isDM && token && !view.combatant && (
          <ConfirmButton className="btn btn-ghost btn-small" confirmLabel="Tap again to remove" onConfirm={onRemoveWalkOn}>
            Remove
          </ConfirmButton>
        )}
      </div>
    </div>
  );
}

// Fitting the grid to the picture, live over the scene: how many squares
// run across it, and what one is worth.
function GridEditor({ draft, hasGrid, onChange, onSave, onRemove, onCancel }) {
  const across = Math.round((1 / draft.size) * 4) / 4;
  const setAcross = (n) => onChange({ ...draft, size: 1 / Math.min(100, Math.max(2, n)) });
  return (
    <div className="scene-grid-editor" role="dialog" aria-label="Grid">
      <div className="scene-grid-editor-row">
        <label htmlFor="gridAcross">Squares across</label>
        <button type="button" className="btn btn-ghost btn-small" onClick={() => setAcross(across - 0.25)} aria-label="Fewer squares">
          −
        </button>
        <strong>{across}</strong>
        <button type="button" className="btn btn-ghost btn-small" onClick={() => setAcross(across + 0.25)} aria-label="More squares">
          +
        </button>
      </div>
      <input id="gridAcross" type="range" min="4" max="60" step="0.25" value={across} onChange={(e) => setAcross(Number(e.target.value))} />
      <div className="scene-grid-editor-row">
        <label htmlFor="gridFeet">One square is</label>
        <input
          id="gridFeet"
          type="number"
          min="1"
          max="100"
          value={draft.feet}
          onChange={(e) => onChange({ ...draft, feet: Math.min(100, Math.max(1, Math.round(Number(e.target.value)) || 5)) })}
        />
        <span>ft</span>
      </div>
      <div className="scene-grid-editor-row">
        <button type="button" className="btn btn-primary btn-small" onClick={onSave}>
          Save Grid
        </button>
        <button type="button" className="btn btn-ghost btn-small" onClick={onCancel}>
          Cancel
        </button>
        {hasGrid && (
          <button type="button" className="btn btn-ghost btn-small" onClick={onRemove}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

// The DM's picked tokens: the whole party in one tap, a marching order,
// reveal what's hidden. Tapping the map walks them there.
function GroupBar({ count, canHurt, fightOn, onHp, onCondition, anyHidden, onParty, onArrange, onReveal, onClear }) {
  const [amount, setAmount] = useState('');
  const hit = (sign) => {
    onHp((Math.abs(Number(amount)) || 1) * sign);
    setAmount('');
  };
  return (
    <div className="group-bar" role="toolbar" aria-label="Picked tokens">
      <p className="group-bar-hint">
        {count === 0 ? 'Tap tokens to pick them — or pick the whole party.' : `${count} picked — tap the map to move them there, or drag one.`}
      </p>
      <div className="preset-grid">
        <button type="button" className="preset-chip" onClick={onParty}>
          Whole party
        </button>
        {count > 1 &&
          FORMATIONS.map((f) => (
            <button key={f.id} type="button" className="preset-chip" onClick={() => onArrange(f.id)}>
              {f.name}
            </button>
          ))}
        {anyHidden && (
          <button type="button" className="preset-chip active" onClick={onReveal}>
            Reveal
          </button>
        )}
        {count > 0 && (
          <button type="button" className="preset-chip" onClick={onClear}>
            Clear
          </button>
        )}
      </div>
      {count > 0 && canHurt && (
        <div className="group-bar-row">
          <input
            type="number"
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="8"
            className="hp-adjust-input"
            aria-label="Amount for everyone picked"
          />
          <button type="button" className="btn btn-danger btn-small" onClick={() => hit(-1)}>
            Damage all
          </button>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => hit(1)}>
            Heal all
          </button>
          <ConditionPicker onPick={onCondition} existing={[]} timed={fightOn} />
        </div>
      )}
    </div>
  );
}
