// Codex — AI campaign generator (BIBLE.md §7). The one place in the app
// that talks to Claude, because it needs ANTHROPIC_API_KEY, a secret the
// browser must never see — same doctrine as the Supabase service-role
// key (BIBLE.md §5): read only here, never VITE_-prefixed.
//
// Give it a one-line premise and it returns a "campaign seed" — a
// campaign name/description plus a batch of Encyclopedia entries,
// Bestiary stat blocks, and (optionally) one DM-only note — shaped to
// drop straight into lib/campaigns.js / lib/encyclopedia.js /
// lib/bestiary.js / lib/notes.js exactly like a hand-typed entry would
// (see lib/campaignGenerator.js, which does that import on the client).

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

// Vercel's default Node function duration is too short for a several-
// thousand-token creative generation; this needs a paid plan's higher
// ceiling (Hobby caps at 60s regardless of this setting).
export const config = { maxDuration: 60 };

// Mirrors the matching constants in src/lib/ (encyclopedia.js
// CATEGORIES, bestiary.js ABILITY_KEYS, notes.js VISIBILITIES) —
// duplicated rather than imported because those modules import
// lib/supabase.js, which reads `import.meta.env` (a Vite build-time
// global that doesn't exist in this plain Node serverless function). If
// those id lists ever change, update both places.
const ENCYCLOPEDIA_CATEGORIES = ['location', 'npc', 'faction', 'item', 'lore', 'other'];
const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const NOTE_VISIBILITIES = ['private', 'dm', 'campaign'];

const abilitiesSchema = z.object(Object.fromEntries(ABILITY_KEYS.map((key) => [key, z.number().int()])));

// The "campaign seed" shape — one object the client can drop straight
// into a create() call per row (see lib/campaignGenerator.js).
const campaignSeedSchema = z.object({
  campaign: z.object({
    name: z.string(),
    description: z.string(),
  }),
  encyclopediaEntries: z.array(
    z.object({
      category: z.enum(ENCYCLOPEDIA_CATEGORIES),
      title: z.string(),
      body: z.string(),
      tags: z.array(z.string()),
    }),
  ),
  bestiaryEntries: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
      size: z.string(),
      armorClass: z.number().int(),
      hitPoints: z.number().int(),
      hitDice: z.string(),
      speed: z.string(),
      abilities: abilitiesSchema,
      challengeRating: z.string(),
      traits: z.string(),
      actions: z.string(),
      notes: z.string(),
    }),
  ),
  notes: z.array(
    z.object({
      title: z.string(),
      visibility: z.enum(NOTE_VISIBILITIES),
      body: z.string(),
    }),
  ),
});

const SYSTEM_PROMPT = `You are helping a Dungeon Master seed a brand-new tabletop D&D campaign inside "Codex," a campaign-companion app. Given a short premise, generate grounded, table-ready content shaped exactly like the app's own examples:

- Encyclopedia entries (locations/NPCs/factions) read like a DM's own notes: what it is, why the party cares, one concrete hook — a few short paragraphs, never a lore dump.
- Bestiary stat blocks are usable 5e-style creatures: sensible ability scores, an armor class/HP/hit dice that make sense together, and a challenge rating scaled to the requested party level.
- Everything should connect to the same premise and to each other where it makes sense (an NPC who belongs to a named faction, a creature that lairs near a named location) — this is one small, coherent campaign seed, not a grab-bag of unrelated ideas.
- Keep names and tone consistent with the premise's setting.`;

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({
      error: "The AI campaign generator isn't configured on this deployment — ask whoever runs it to set ANTHROPIC_API_KEY.",
    });
    return;
  }

  const body = req.body ?? {};
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    res.status(400).json({ error: 'Describe the campaign you want first.' });
    return;
  }

  const partyLevel = clampInt(body.partyLevel, 3, 1, 20);
  const numLocations = clampInt(body.numLocations, 3, 0, 8);
  const numNpcs = clampInt(body.numNpcs, 4, 0, 8);
  const numFactions = clampInt(body.numFactions, 2, 0, 6);
  const numCreatures = clampInt(body.numCreatures, 3, 0, 8);
  const includeNote = Boolean(body.includeNote);

  const userPrompt = [
    `Campaign premise: ${prompt}`,
    `Party level: ${partyLevel}`,
    `Generate ${numLocations} location, ${numNpcs} NPC, and ${numFactions} faction encyclopedia entries (encyclopediaEntries).`,
    `Generate ${numCreatures} bestiary stat blocks (bestiaryEntries) scaled to a level-${partyLevel} party.`,
    includeNote
      ? 'Also generate exactly one DM-only "session zero" note (notes array, visibility "dm") summarizing hooks and secrets the party doesn\'t know yet.'
      : 'Return an empty notes array — no session-zero note was requested.',
  ].join('\n');

  try {
    const client = new Anthropic();
    const response = await client.messages.parse({
      model: 'claude-opus-5',
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      output_config: { format: zodOutputFormat(campaignSeedSchema) },
      messages: [{ role: 'user', content: userPrompt }],
    });

    if (response.stop_reason === 'refusal') {
      res.status(422).json({ error: "That premise couldn't be generated — try rephrasing it." });
      return;
    }
    if (response.parsed_output == null) {
      res.status(502).json({ error: "The generator didn't return a usable campaign — try again or simplify the prompt." });
      return;
    }

    res.status(200).json(response.parsed_output);
  } catch (err) {
    console.error('generate-campaign error:', err);
    const clientFacing = err?.status >= 400 && err.status < 500;
    res.status(clientFacing ? 502 : 500).json({
      error: "Something went wrong generating that campaign — try again in a moment.",
    });
  }
}
