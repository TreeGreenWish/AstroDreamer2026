import Database from "better-sqlite3";

import { extractDreamEntityCandidates } from "./dreamEntities.js";
import type { Dream, DreamEntitySummary, DreamEntityType, UserProfile } from "../types";

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const useSupabase = Boolean(supabaseUrl && supabaseServiceRoleKey);
const DREAM_IMAGE_BUCKET = "dream-images";
const DREAM_IMAGE_REF_PREFIX = `storage://${DREAM_IMAGE_BUCKET}/`;
const DREAM_IMAGE_SIGNED_TTL_SECONDS = 60 * 60;

function supabaseHeaders(extra: Record<string, string> = {}) {
  if (!supabaseServiceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return {
    apikey: supabaseServiceRoleKey,
    Authorization: `Bearer ${supabaseServiceRoleKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function supabaseRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!supabaseUrl) throw new Error("SUPABASE_URL is not configured");
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: { ...supabaseHeaders(), ...(init.headers || {}) },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${detail}`);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return text ? JSON.parse(text) : (undefined as T);
}

function ownerFilter(userId?: string) {
  return userId ? `user_id=eq.${encodeURIComponent(userId)}` : "user_id=is.null";
}

function imageObjectPath(value?: string | null): string | null {
  if (!value) return null;
  if (value.startsWith(DREAM_IMAGE_REF_PREFIX)) return value.slice(DREAM_IMAGE_REF_PREFIX.length);
  if (!supabaseUrl || !value.startsWith(supabaseUrl)) return null;
  try {
    const url = new URL(value);
    const prefixes = [
      `/storage/v1/object/public/${DREAM_IMAGE_BUCKET}/`,
      `/storage/v1/object/sign/${DREAM_IMAGE_BUCKET}/`,
    ];
    const prefix = prefixes.find(item => url.pathname.startsWith(item));
    if (!prefix) return null;
    return decodeURIComponent(url.pathname.slice(prefix.length));
  } catch {
    return null;
  }
}

function storedImageReference(value?: string | null): string | null {
  if (!value) return null;
  const objectPath = imageObjectPath(value);
  return objectPath ? `${DREAM_IMAGE_REF_PREFIX}${objectPath}` : value;
}

async function signedDreamImageUrl(value?: string | null): Promise<string | undefined> {
  if (!value) return undefined;
  const objectPath = imageObjectPath(value);
  if (!objectPath || !supabaseUrl || !supabaseServiceRoleKey) return value;
  const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${supabaseUrl}/storage/v1/object/sign/${DREAM_IMAGE_BUCKET}/${encodedPath}`, {
    method: "POST",
    headers: supabaseHeaders(),
    body: JSON.stringify({ expiresIn: DREAM_IMAGE_SIGNED_TTL_SECONDS }),
  });
  if (!response.ok) throw new Error(`Dream image signing failed (${response.status}): ${await response.text()}`);
  const payload = await response.json() as { signedURL?: string; signedUrl?: string };
  const signed = payload.signedURL || payload.signedUrl;
  if (!signed) throw new Error("Dream image signing did not return a URL");
  if (/^https?:\/\//i.test(signed)) return signed;
  return `${supabaseUrl}/storage/v1${signed.startsWith("/") ? signed : `/${signed}`}`;
}

async function materializeDreamImage(dream: Dream): Promise<Dream> {
  if (!dream.image_url) return dream;
  return { ...dream, image_url: await signedDreamImageUrl(dream.image_url) };
}

async function uploadDreamImage(dataUrl: string, dreamId: number, userId?: string): Promise<string> {
  if (!supabaseUrl || !supabaseServiceRoleKey || !dataUrl.startsWith("data:image/")) return storedImageReference(dataUrl) || dataUrl;
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return dataUrl;
  const [, contentType, base64] = match;
  const extension = contentType.split("/")[1]?.replace("jpeg", "jpg") || "png";
  const ownerPath = userId || "legacy";
  const objectPath = `${ownerPath}/${dreamId}/${Date.now()}.${extension}`;
  const bytes = Buffer.from(base64, "base64");
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${DREAM_IMAGE_BUCKET}/${objectPath}`, {
    method: "POST",
    headers: {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: bytes,
  });
  if (!response.ok) throw new Error(`Dream image upload failed (${response.status}): ${await response.text()}`);
  return `${DREAM_IMAGE_REF_PREFIX}${objectPath}`;
}

async function deleteDreamImage(value?: string | null) {
  const objectPath = imageObjectPath(value);
  if (!objectPath || !supabaseUrl || !supabaseServiceRoleKey) return;
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${DREAM_IMAGE_BUCKET}`, {
    method: "DELETE",
    headers: supabaseHeaders(),
    body: JSON.stringify({ prefixes: [objectPath] }),
  });
  if (!response.ok && response.status !== 404) throw new Error(`Dream image delete failed (${response.status}): ${await response.text()}`);
}

function normalizeDreamForSqlite(dream: any): Dream {
  return {
    ...dream,
    planetary_influences: dream.planetary_influences ? JSON.parse(dream.planetary_influences) : undefined,
    tags: dream.tags ? JSON.parse(dream.tags) : [],
    notes: dream.notes ? JSON.parse(dream.notes) : [],
  };
}

class SqliteStore {
  private db: Database.Database;
  constructor() { this.db = new Database("astradream.db"); this.initialize(); }

  private initialize() {
    this.db.pragma("foreign_keys = ON");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_profile (
        id INTEGER PRIMARY KEY CHECK (id = 1), name TEXT, dob TEXT, tob TEXT,
        lob_lat REAL, lob_lng REAL, lob_name TEXT, life_path INTEGER,
        chinese_zodiac TEXT, birth_chart_interpretation TEXT, sun_sign TEXT,
        moon_sign TEXT, mercury_sign TEXT, venus_sign TEXT, mars_sign TEXT,
        jupiter_sign TEXT, saturn_sign TEXT, uranus_sign TEXT, neptune_sign TEXT,
        pluto_sign TEXT, rising_sign TEXT
      );
      CREATE TABLE IF NOT EXISTS dreams (
        id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, content TEXT, date TEXT,
        time TEXT, location_lat REAL, location_lng REAL, location_name TEXT,
        interpretation TEXT, image_url TEXT, sun_sign TEXT, moon_sign TEXT,
        mercury_sign TEXT, venus_sign TEXT, mars_sign TEXT, jupiter_sign TEXT,
        saturn_sign TEXT, uranus_sign TEXT, neptune_sign TEXT, pluto_sign TEXT,
        moon_phase TEXT, day_number INTEGER, planetary_influences TEXT, tags TEXT,
        notes TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS dream_entities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        canonical_name TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        aliases TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'active',
        merged_into_entity_id INTEGER REFERENCES dream_entities(id),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(entity_type, normalized_name)
      );
      CREATE TABLE IF NOT EXISTS dream_entity_mentions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dream_id INTEGER NOT NULL REFERENCES dreams(id) ON DELETE CASCADE,
        entity_id INTEGER NOT NULL REFERENCES dream_entities(id) ON DELETE CASCADE,
        surface_form TEXT NOT NULL,
        context TEXT,
        confidence TEXT NOT NULL DEFAULT 'medium',
        source_version INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(dream_id, entity_id)
      );
      CREATE INDEX IF NOT EXISTS dream_entity_mentions_entity_idx ON dream_entity_mentions(entity_id);
      CREATE INDEX IF NOT EXISTS dream_entity_mentions_dream_idx ON dream_entity_mentions(dream_id);
    `);
    const dreamsColumnNames = (this.db.prepare("PRAGMA table_info(dreams)").all() as any[]).map(c => c.name);
    ["sun_sign","moon_sign","mercury_sign","venus_sign","mars_sign","jupiter_sign","saturn_sign","uranus_sign","neptune_sign","pluto_sign","moon_phase","day_number","planetary_influences","tags","notes"].forEach(column => {
      if (!dreamsColumnNames.includes(column)) this.db.exec(`ALTER TABLE dreams ADD COLUMN ${column} ${column === "day_number" ? "INTEGER" : "TEXT"}`);
    });
    const profileColumnNames = (this.db.prepare("PRAGMA table_info(user_profile)").all() as any[]).map(c => c.name);
    ["sun_sign","moon_sign","mercury_sign","venus_sign","mars_sign","jupiter_sign","saturn_sign","uranus_sign","neptune_sign","pluto_sign","rising_sign"].forEach(column => {
      if (!profileColumnNames.includes(column)) this.db.exec(`ALTER TABLE user_profile ADD COLUMN ${column} TEXT`);
    });
  }

  async getProfile(_userId?: string): Promise<UserProfile | null> {
    return (this.db.prepare("SELECT * FROM user_profile WHERE id = 1").get() as UserProfile) || null;
  }

  async saveProfile(profile: UserProfile, _userId?: string) {
    const values = [profile.name, profile.dob, profile.tob, profile.lob_lat, profile.lob_lng, profile.lob_name, profile.life_path, profile.chinese_zodiac, profile.birth_chart_interpretation, profile.sun_sign, profile.moon_sign, profile.mercury_sign, profile.venus_sign, profile.mars_sign, profile.jupiter_sign, profile.saturn_sign, profile.uranus_sign, profile.neptune_sign, profile.pluto_sign, profile.rising_sign];
    const exists = this.db.prepare("SELECT id FROM user_profile WHERE id = 1").get();
    if (exists) {
      this.db.prepare(`UPDATE user_profile SET name=?,dob=?,tob=?,lob_lat=?,lob_lng=?,lob_name=?,life_path=?,chinese_zodiac=?,birth_chart_interpretation=?,sun_sign=?,moon_sign=?,mercury_sign=?,venus_sign=?,mars_sign=?,jupiter_sign=?,saturn_sign=?,uranus_sign=?,neptune_sign=?,pluto_sign=?,rising_sign=? WHERE id=1`).run(...values);
    } else {
      this.db.prepare(`INSERT INTO user_profile (id,name,dob,tob,lob_lat,lob_lng,lob_name,life_path,chinese_zodiac,birth_chart_interpretation,sun_sign,moon_sign,mercury_sign,venus_sign,mars_sign,jupiter_sign,saturn_sign,uranus_sign,neptune_sign,pluto_sign,rising_sign) VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...values);
    }
  }

  async getDreams(_userId?: string): Promise<Dream[]> {
    return (this.db.prepare("SELECT * FROM dreams ORDER BY date DESC, time DESC").all() as any[]).map(normalizeDreamForSqlite);
  }

  async createDream(dream: Dream, _userId?: string): Promise<Dream> {
    const result = this.db.prepare(`INSERT INTO dreams (title,content,date,time,location_lat,location_lng,location_name,interpretation,image_url,sun_sign,moon_sign,mercury_sign,venus_sign,mars_sign,jupiter_sign,saturn_sign,uranus_sign,neptune_sign,pluto_sign,moon_phase,day_number,planetary_influences,tags,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(dream.title,dream.content,dream.date,dream.time,dream.location_lat,dream.location_lng,dream.location_name,dream.interpretation,dream.image_url,dream.sun_sign,dream.moon_sign,dream.mercury_sign,dream.venus_sign,dream.mars_sign,dream.jupiter_sign,dream.saturn_sign,dream.uranus_sign,dream.neptune_sign,dream.pluto_sign,dream.moon_phase,dream.day_number,JSON.stringify(dream.planetary_influences ?? null),JSON.stringify(dream.tags ?? []),JSON.stringify(dream.notes ?? []));
    return { ...dream, id: Number(result.lastInsertRowid) };
  }

  async updateDream(id: number, dream: Dream, _userId?: string): Promise<Dream> {
    this.db.prepare(`UPDATE dreams SET title=?,content=?,date=?,time=?,location_lat=?,location_lng=?,location_name=?,interpretation=?,image_url=?,sun_sign=?,moon_sign=?,mercury_sign=?,venus_sign=?,mars_sign=?,jupiter_sign=?,saturn_sign=?,uranus_sign=?,neptune_sign=?,pluto_sign=?,moon_phase=?,day_number=?,planetary_influences=?,tags=?,notes=? WHERE id=?`).run(dream.title,dream.content,dream.date,dream.time,dream.location_lat,dream.location_lng,dream.location_name,dream.interpretation,dream.image_url,dream.sun_sign,dream.moon_sign,dream.mercury_sign,dream.venus_sign,dream.mars_sign,dream.jupiter_sign,dream.saturn_sign,dream.uranus_sign,dream.neptune_sign,dream.pluto_sign,dream.moon_phase,dream.day_number,JSON.stringify(dream.planetary_influences ?? null),JSON.stringify(dream.tags ?? []),JSON.stringify(dream.notes ?? []),id);
    return { ...dream, id };
  }

  async syncDreamEntities(dream: Dream, _userId?: string): Promise<number> {
    if (!dream.id) throw new Error("A saved dream id is required before syncing entities");
    const candidates = extractDreamEntityCandidates(dream);
    const sync = this.db.transaction(() => {
      const upsert = this.db.prepare(`INSERT INTO dream_entities (entity_type,canonical_name,normalized_name)
        VALUES (?,?,?) ON CONFLICT(entity_type,normalized_name) DO UPDATE SET updated_at=CURRENT_TIMESTAMP`);
      const find = this.db.prepare("SELECT id FROM dream_entities WHERE entity_type=? AND normalized_name=?");
      const insertMention = this.db.prepare(`INSERT INTO dream_entity_mentions
        (dream_id,entity_id,surface_form,context,confidence,source_version) VALUES (?,?,?,?,?,1)`);
      const resolved = candidates.map(candidate => {
        upsert.run(candidate.entity_type, candidate.canonical_name, candidate.normalized_name);
        const entity = find.get(candidate.entity_type, candidate.normalized_name) as { id: number };
        return { candidate, entityId: entity.id };
      });
      this.db.prepare("DELETE FROM dream_entity_mentions WHERE dream_id=?").run(dream.id);
      for (const { candidate, entityId } of resolved) {
        insertMention.run(dream.id, entityId, candidate.surface_form, candidate.context || null, candidate.confidence);
      }
      return resolved.length;
    });
    return sync();
  }

  async getEntitySummaries(_userId?: string): Promise<DreamEntitySummary[]> {
    const rows = this.db.prepare(`SELECT e.*, COUNT(m.id) AS mention_count,
      GROUP_CONCAT(m.dream_id) AS dream_ids, MIN(d.date) AS first_seen, MAX(d.date) AS last_seen
      FROM dream_entities e LEFT JOIN dream_entity_mentions m ON m.entity_id=e.id
      LEFT JOIN dreams d ON d.id=m.dream_id GROUP BY e.id
      ORDER BY mention_count DESC, e.canonical_name ASC`).all() as any[];
    return rows.map(row => ({
      ...row, aliases: JSON.parse(row.aliases || "[]"), mention_count: Number(row.mention_count || 0),
      dream_ids: row.dream_ids ? String(row.dream_ids).split(",").map(Number) : [],
    }));
  }

  async deleteDream(id: number, _userId?: string) { this.db.prepare("DELETE FROM dreams WHERE id = ?").run(id); }
}

class SupabaseStore {
  async getProfile(userId?: string): Promise<UserProfile | null> {
    const rows = await supabaseRequest<UserProfile[]>(`user_profiles?${ownerFilter(userId)}&select=*&limit=1`);
    return rows[0] ?? null;
  }

  async saveProfile(profile: UserProfile, userId?: string) {
    if (!userId) {
      await supabaseRequest("user_profiles?id=eq.1", { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ...profile, id: 1 }) });
      return;
    }
    const existing = await supabaseRequest<Array<{id:number}>>(`user_profiles?user_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`);
    if (existing[0]?.id) {
      await supabaseRequest(`user_profiles?id=eq.${existing[0].id}&user_id=eq.${encodeURIComponent(userId)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ...profile, id: existing[0].id, user_id: userId }) });
    } else {
      await supabaseRequest("user_profiles", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ...profile, id: undefined, user_id: userId }) });
    }
  }

  async getDreams(userId?: string): Promise<Dream[]> {
    const rows = await supabaseRequest<Dream[]>(`dreams?${ownerFilter(userId)}&select=*&order=date.desc,time.desc`);
    return Promise.all(rows.map(materializeDreamImage));
  }

  async createDream(dream: Dream, userId?: string): Promise<Dream> {
    const { image_url, ...withoutImage } = dream;
    const rows = await supabaseRequest<Dream[]>("dreams?select=*", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ...withoutImage, id: undefined, user_id: userId ?? null, image_url: null }),
    });
    const saved = rows[0];
    if (!saved?.id) throw new Error("Supabase did not return a dream id");
    if (image_url) {
      const imageReference = image_url.startsWith("data:image/") ? await uploadDreamImage(image_url, saved.id, userId) : storedImageReference(image_url);
      await supabaseRequest(`dreams?id=eq.${saved.id}&${ownerFilter(userId)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ image_url: imageReference }) });
      saved.image_url = imageReference || undefined;
    }
    return materializeDreamImage(saved);
  }

  async updateDream(id: number, dream: Dream, userId?: string): Promise<Dream> {
    let imageUrl = dream.image_url;
    if (imageUrl?.startsWith("data:image/")) imageUrl = await uploadDreamImage(imageUrl, id, userId);
    else imageUrl = storedImageReference(imageUrl) || undefined;
    const rows = await supabaseRequest<Dream[]>(`dreams?id=eq.${id}&${ownerFilter(userId)}&select=*`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ...dream, id, user_id: userId ?? null, image_url: imageUrl ?? null }),
    });
    if (!rows[0]) throw new Error("Dream not found or not owned by this account");
    return materializeDreamImage(rows[0]);
  }

  async syncDreamEntities(dream: Dream, userId?: string): Promise<number> {
    if (!dream.id) throw new Error("A saved dream id is required before syncing entities");
    if (!userId) return 0;
    const candidates = extractDreamEntityCandidates(dream);
    const existing = await supabaseRequest<any[]>(`dream_entities?user_id=eq.${encodeURIComponent(userId)}&select=*`);
    const existingKeys = new Set(existing.map(entity => `${entity.entity_type}:${entity.normalized_name}`));
    const missing = candidates.filter(candidate => !existingKeys.has(`${candidate.entity_type}:${candidate.normalized_name}`));
    if (missing.length) await supabaseRequest("dream_entities?on_conflict=user_id%2Centity_type%2Cnormalized_name", {
      method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify(missing.map(candidate => ({
        user_id: userId, entity_type: candidate.entity_type, canonical_name: candidate.canonical_name,
        normalized_name: candidate.normalized_name, aliases: [], status: "active",
      }))),
    });
    const entities = missing.length
      ? await supabaseRequest<any[]>(`dream_entities?user_id=eq.${encodeURIComponent(userId)}&select=*`)
      : existing;
    const byKey = new Map(entities.map(entity => [`${entity.entity_type}:${entity.normalized_name}`, entity]));
    const mentions = candidates.map(candidate => {
      const entity = byKey.get(`${candidate.entity_type}:${candidate.normalized_name}`);
      if (!entity?.id) throw new Error(`Entity was not persisted: ${candidate.entity_type}/${candidate.canonical_name}`);
      return {
        user_id: userId, dream_id: dream.id, entity_id: entity.id, surface_form: candidate.surface_form,
        context: candidate.context || null, confidence: candidate.confidence, source_version: 1,
      };
    });
    await supabaseRequest(`dream_entity_mentions?dream_id=eq.${dream.id}&user_id=eq.${encodeURIComponent(userId)}`, {
      method: "DELETE", headers: { Prefer: "return=minimal" },
    });
    if (mentions.length) await supabaseRequest("dream_entity_mentions", {
      method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(mentions),
    });
    return mentions.length;
  }

  async getEntitySummaries(userId?: string): Promise<DreamEntitySummary[]> {
    if (!userId) return [];
    const owner = encodeURIComponent(userId);
    const [entities, mentions, dreams] = await Promise.all([
      supabaseRequest<any[]>(`dream_entities?user_id=eq.${owner}&select=*&order=canonical_name.asc`),
      supabaseRequest<any[]>(`dream_entity_mentions?user_id=eq.${owner}&select=entity_id,dream_id`),
      supabaseRequest<Array<{id:number;date:string}>>(`dreams?user_id=eq.${owner}&select=id,date`),
    ]);
    const dateByDream = new Map(dreams.map(dream => [dream.id, dream.date]));
    return entities.map(entity => {
      const entityMentions = mentions.filter(mention => mention.entity_id === entity.id);
      const dates = entityMentions.map(mention => dateByDream.get(mention.dream_id)).filter(Boolean).sort() as string[];
      return {
        id: entity.id, entity_type: entity.entity_type as DreamEntityType, canonical_name: entity.canonical_name,
        normalized_name: entity.normalized_name, aliases: entity.aliases || [], status: entity.status,
        merged_into_entity_id: entity.merged_into_entity_id, mention_count: entityMentions.length,
        dream_ids: entityMentions.map(mention => mention.dream_id), first_seen: dates[0], last_seen: dates[dates.length - 1],
      };
    }).sort((a, b) => b.mention_count - a.mention_count || a.canonical_name.localeCompare(b.canonical_name));
  }

  async deleteDream(id: number, userId?: string) {
    const existing = await supabaseRequest<Array<{ id: number; image_url?: string | null }>>(`dreams?id=eq.${id}&${ownerFilter(userId)}&select=id,image_url&limit=1`);
    if (!existing[0]) throw new Error("Dream not found or not owned by this account");
    const rows = await supabaseRequest<Dream[]>(`dreams?id=eq.${id}&${ownerFilter(userId)}&select=id`, { method: "DELETE", headers: { Prefer: "return=representation" } });
    if (!rows.length) throw new Error("Dream not found or not owned by this account");
    await deleteDreamImage(existing[0].image_url);
  }
}

export const dataStore = useSupabase ? new SupabaseStore() : new SqliteStore();
export const persistenceProvider = useSupabase ? "supabase" : "sqlite";
