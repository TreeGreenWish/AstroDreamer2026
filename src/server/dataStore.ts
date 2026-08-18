import Database from "better-sqlite3";

import type { Dream, UserProfile } from "../types";

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const useSupabase = Boolean(supabaseUrl && supabaseServiceRoleKey);

function supabaseHeaders(extra: Record<string, string> = {}) {
  if (!supabaseServiceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }

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
    headers: {
      ...supabaseHeaders(),
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${detail}`);
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return text ? JSON.parse(text) : (undefined as T);
}

async function uploadDreamImage(dataUrl: string, dreamId: number): Promise<string> {
  if (!supabaseUrl || !supabaseServiceRoleKey || !dataUrl.startsWith("data:image/")) {
    return dataUrl;
  }

  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return dataUrl;

  const [, contentType, base64] = match;
  const extension = contentType.split("/")[1]?.replace("jpeg", "jpg") || "png";
  const objectPath = `${dreamId}/${Date.now()}.${extension}`;
  const bytes = Buffer.from(base64, "base64");

  const response = await fetch(
    `${supabaseUrl}/storage/v1/object/dream-images/${objectPath}`,
    {
      method: "POST",
      headers: {
        apikey: supabaseServiceRoleKey,
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
        "Content-Type": contentType,
        "x-upsert": "true",
      },
      body: bytes,
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Dream image upload failed (${response.status}): ${detail}`);
  }

  return `${supabaseUrl}/storage/v1/object/public/dream-images/${objectPath}`;
}

function normalizeDreamForSqlite(dream: any): Dream {
  return {
    ...dream,
    planetary_influences: dream.planetary_influences
      ? JSON.parse(dream.planetary_influences)
      : undefined,
    tags: dream.tags ? JSON.parse(dream.tags) : [],
    notes: dream.notes ? JSON.parse(dream.notes) : [],
  };
}

class SqliteStore {
  private db: Database.Database;

  constructor() {
    this.db = new Database("astradream.db");
    this.initialize();
  }

  private initialize() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_profile (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        name TEXT,
        dob TEXT,
        tob TEXT,
        lob_lat REAL,
        lob_lng REAL,
        lob_name TEXT,
        life_path INTEGER,
        chinese_zodiac TEXT,
        birth_chart_interpretation TEXT,
        sun_sign TEXT,
        moon_sign TEXT,
        mercury_sign TEXT,
        venus_sign TEXT,
        mars_sign TEXT,
        jupiter_sign TEXT,
        saturn_sign TEXT,
        uranus_sign TEXT,
        neptune_sign TEXT,
        pluto_sign TEXT,
        rising_sign TEXT
      );

      CREATE TABLE IF NOT EXISTS dreams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        content TEXT,
        date TEXT,
        time TEXT,
        location_lat REAL,
        location_lng REAL,
        location_name TEXT,
        interpretation TEXT,
        image_url TEXT,
        sun_sign TEXT,
        moon_sign TEXT,
        mercury_sign TEXT,
        venus_sign TEXT,
        mars_sign TEXT,
        jupiter_sign TEXT,
        saturn_sign TEXT,
        uranus_sign TEXT,
        neptune_sign TEXT,
        pluto_sign TEXT,
        moon_phase TEXT,
        day_number INTEGER,
        planetary_influences TEXT,
        tags TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const dreamsColumns = this.db.prepare("PRAGMA table_info(dreams)").all() as any[];
    const dreamsColumnNames = dreamsColumns.map((column) => column.name);
    const requiredDreamsColumns = [
      "sun_sign", "moon_sign", "mercury_sign", "venus_sign",
      "mars_sign", "jupiter_sign", "saturn_sign", "uranus_sign",
      "neptune_sign", "pluto_sign", "moon_phase", "day_number",
      "planetary_influences", "tags", "notes",
    ];

    requiredDreamsColumns.forEach((column) => {
      if (!dreamsColumnNames.includes(column)) {
        const type = column === "day_number" ? "INTEGER" : "TEXT";
        this.db.exec(`ALTER TABLE dreams ADD COLUMN ${column} ${type}`);
      }
    });

    const profileColumns = this.db.prepare("PRAGMA table_info(user_profile)").all() as any[];
    const profileColumnNames = profileColumns.map((column) => column.name);
    [
      "sun_sign", "moon_sign", "mercury_sign", "venus_sign",
      "mars_sign", "jupiter_sign", "saturn_sign", "uranus_sign",
      "neptune_sign", "pluto_sign", "rising_sign",
    ].forEach((column) => {
      if (!profileColumnNames.includes(column)) {
        this.db.exec(`ALTER TABLE user_profile ADD COLUMN ${column} TEXT`);
      }
    });
  }

  async getProfile(): Promise<UserProfile | null> {
    return (this.db.prepare("SELECT * FROM user_profile WHERE id = 1").get() as UserProfile) || null;
  }

  async saveProfile(profile: UserProfile) {
    const values = [
      profile.name, profile.dob, profile.tob, profile.lob_lat, profile.lob_lng,
      profile.lob_name, profile.life_path, profile.chinese_zodiac,
      profile.birth_chart_interpretation, profile.sun_sign, profile.moon_sign,
      profile.mercury_sign, profile.venus_sign, profile.mars_sign,
      profile.jupiter_sign, profile.saturn_sign, profile.uranus_sign,
      profile.neptune_sign, profile.pluto_sign, profile.rising_sign,
    ];

    const exists = this.db.prepare("SELECT id FROM user_profile WHERE id = 1").get();
    if (exists) {
      this.db.prepare(`
        UPDATE user_profile SET
          name = ?, dob = ?, tob = ?, lob_lat = ?, lob_lng = ?, lob_name = ?,
          life_path = ?, chinese_zodiac = ?, birth_chart_interpretation = ?,
          sun_sign = ?, moon_sign = ?, mercury_sign = ?, venus_sign = ?,
          mars_sign = ?, jupiter_sign = ?, saturn_sign = ?, uranus_sign = ?,
          neptune_sign = ?, pluto_sign = ?, rising_sign = ?
        WHERE id = 1
      `).run(...values);
    } else {
      this.db.prepare(`
        INSERT INTO user_profile (
          id, name, dob, tob, lob_lat, lob_lng, lob_name, life_path,
          chinese_zodiac, birth_chart_interpretation, sun_sign, moon_sign,
          mercury_sign, venus_sign, mars_sign, jupiter_sign, saturn_sign,
          uranus_sign, neptune_sign, pluto_sign, rising_sign
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(...values);
    }
  }

  async getDreams(): Promise<Dream[]> {
    const dreams = this.db.prepare("SELECT * FROM dreams ORDER BY date DESC, time DESC").all();
    return dreams.map(normalizeDreamForSqlite);
  }

  async createDream(dream: Dream): Promise<Dream> {
    const result = this.db.prepare(`
      INSERT INTO dreams (
        title, content, date, time, location_lat, location_lng, location_name,
        interpretation, image_url, sun_sign, moon_sign, mercury_sign,
        venus_sign, mars_sign, jupiter_sign, saturn_sign, uranus_sign,
        neptune_sign, pluto_sign, moon_phase, day_number, planetary_influences,
        tags, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      dream.title, dream.content, dream.date, dream.time, dream.location_lat,
      dream.location_lng, dream.location_name, dream.interpretation,
      dream.image_url, dream.sun_sign, dream.moon_sign, dream.mercury_sign,
      dream.venus_sign, dream.mars_sign, dream.jupiter_sign, dream.saturn_sign,
      dream.uranus_sign, dream.neptune_sign, dream.pluto_sign, dream.moon_phase,
      dream.day_number, JSON.stringify(dream.planetary_influences ?? null),
      JSON.stringify(dream.tags ?? []), JSON.stringify(dream.notes ?? []),
    );

    return { ...dream, id: Number(result.lastInsertRowid) };
  }

  async updateDream(id: number, dream: Dream): Promise<Dream> {
    this.db.prepare(`
      UPDATE dreams SET
        title = ?, content = ?, date = ?, time = ?, location_lat = ?,
        location_lng = ?, location_name = ?, interpretation = ?, image_url = ?,
        sun_sign = ?, moon_sign = ?, mercury_sign = ?, venus_sign = ?,
        mars_sign = ?, jupiter_sign = ?, saturn_sign = ?, uranus_sign = ?,
        neptune_sign = ?, pluto_sign = ?, moon_phase = ?, day_number = ?,
        planetary_influences = ?, tags = ?, notes = ?
      WHERE id = ?
    `).run(
      dream.title, dream.content, dream.date, dream.time, dream.location_lat,
      dream.location_lng, dream.location_name, dream.interpretation,
      dream.image_url, dream.sun_sign, dream.moon_sign, dream.mercury_sign,
      dream.venus_sign, dream.mars_sign, dream.jupiter_sign, dream.saturn_sign,
      dream.uranus_sign, dream.neptune_sign, dream.pluto_sign, dream.moon_phase,
      dream.day_number, JSON.stringify(dream.planetary_influences ?? null),
      JSON.stringify(dream.tags ?? []), JSON.stringify(dream.notes ?? []), id,
    );

    return { ...dream, id };
  }

  async deleteDream(id: number) {
    this.db.prepare("DELETE FROM dreams WHERE id = ?").run(id);
  }
}

class SupabaseStore {
  async getProfile(): Promise<UserProfile | null> {
    const rows = await supabaseRequest<UserProfile[]>("user_profiles?id=eq.1&select=*&limit=1");
    return rows[0] ?? null;
  }

  async saveProfile(profile: UserProfile) {
    await supabaseRequest("user_profiles?on_conflict=id", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({ ...profile, id: 1 }),
    });
  }

  async getDreams(): Promise<Dream[]> {
    return supabaseRequest<Dream[]>("dreams?select=*&order=date.desc,time.desc");
  }

  async createDream(dream: Dream): Promise<Dream> {
    const { image_url, ...withoutImage } = dream;
    const rows = await supabaseRequest<Dream[]>("dreams?select=*", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ...withoutImage, image_url: null }),
    });

    const saved = rows[0];
    if (!saved?.id) throw new Error("Supabase did not return a dream id");

    if (image_url) {
      const persistentImageUrl = await uploadDreamImage(image_url, saved.id);
      await supabaseRequest(`dreams?id=eq.${saved.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ image_url: persistentImageUrl }),
      });
      saved.image_url = persistentImageUrl;
    }

    return saved;
  }

  async updateDream(id: number, dream: Dream): Promise<Dream> {
    let imageUrl = dream.image_url;
    if (imageUrl?.startsWith("data:image/")) {
      imageUrl = await uploadDreamImage(imageUrl, id);
    }

    const rows = await supabaseRequest<Dream[]>(`dreams?id=eq.${id}&select=*`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ...dream, id, image_url: imageUrl ?? null }),
    });

    return rows[0] ?? { ...dream, id, image_url: imageUrl };
  }

  async deleteDream(id: number) {
    await supabaseRequest(`dreams?id=eq.${id}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
  }
}

export const dataStore = useSupabase ? new SupabaseStore() : new SqliteStore();

export const persistenceProvider = useSupabase ? "supabase" : "sqlite";
