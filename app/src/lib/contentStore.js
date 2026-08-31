import { supabase } from './supabase';

// Shared CRUD plumbing for the campaign-scoped content types (encyclopedia,
// bestiary, notes — BIBLE.md §7). Each feature module configures one of
// these per "kind" instead of hand-rolling guest/account branching itself.
// Everything returns camelCase objects and Promises either way, so
// screens don't need to know whether they're talking to localStorage or
// Postgres.

function toCamel(str) {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function toSnake(str) {
  return str.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

function mapKeys(obj, fn) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [fn(k), v]));
}

const rowToCamel = (row) => mapKeys(row, toCamel);
const fieldsToSnake = (fields) => mapKeys(fields, toSnake);

// ---------------------------------------------------------------------
// Guest (localStorage) — one JSON array per kind+campaign.
// ---------------------------------------------------------------------
export function createLocalStore(kind) {
  const key = (campaignId) => `codex.guest.content.${kind}.${campaignId}`;

  function readAll(campaignId) {
    try {
      const raw = localStorage.getItem(key(campaignId));
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function writeAll(campaignId, items) {
    localStorage.setItem(key(campaignId), JSON.stringify(items));
  }

  return {
    async list(campaignId) {
      return readAll(campaignId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async create(campaignId, fields) {
      const now = new Date().toISOString();
      const entry = { id: crypto.randomUUID(), campaignId, createdAt: now, updatedAt: now, ...fields };
      writeAll(campaignId, [...readAll(campaignId), entry]);
      return entry;
    },
    async update(campaignId, id, patch) {
      const items = readAll(campaignId);
      const next = items.map((item) =>
        item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item,
      );
      writeAll(campaignId, next);
      return next.find((item) => item.id === id);
    },
    async remove(campaignId, id) {
      writeAll(campaignId, readAll(campaignId).filter((item) => item.id !== id));
    },
  };
}

// ---------------------------------------------------------------------
// Account (Supabase) — one table per kind, RLS-scoped to campaign
// membership (reads) / DM or author (writes) — see the table's own
// migration for the exact policy.
// ---------------------------------------------------------------------
export function createSupabaseStore(table) {
  return {
    async list(campaignId) {
      const { data, error } = await supabase
        .from(table)
        .select()
        .eq('campaign_id', campaignId)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data.map(rowToCamel);
    },
    async create(campaignId, fields) {
      const { data, error } = await supabase
        .from(table)
        .insert({ ...fieldsToSnake(fields), campaign_id: campaignId })
        .select()
        .single();
      if (error) throw error;
      return rowToCamel(data);
    },
    async update(_campaignId, id, patch) {
      // updated_at isn't sent — a touch_updated_at trigger stamps it
      // server-side (see db/migrations/002_world_building.sql) rather
      // than trusting the client's clock.
      const { data, error } = await supabase
        .from(table)
        .update(fieldsToSnake(patch))
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return rowToCamel(data);
    },
    async remove(_campaignId, id) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
    },
  };
}
