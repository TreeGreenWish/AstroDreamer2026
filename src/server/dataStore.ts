import Database from "better-sqlite3";

import type { Dream, UserProfile } from "../types";

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
