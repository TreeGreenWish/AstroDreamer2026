import "dotenv/config";
import Database from "better-sqlite3";
import fs from "node:fs";

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dbPath = process.env.SQLITE_DB_PATH || "astradream.db";
const execute = process.argv.includes("--execute");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}
if (!fs.existsSync(dbPath)) throw new Error(`SQLite database not found: ${dbPath}`);

const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  "Content-Type": "application/json",
};

async function rest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function uploadImage(dataUrl: string, dreamId: number) {
  if (!dataUrl?.startsWith("data:image/")) return dataUrl || null;
  const match = dataUrl.match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
  if (!match) return dataUrl;
  const [, contentType, base64] = match;
  const ext = contentType.split("/")[1]?.replace("jpeg", "jpg") || "png";
  const objectPath = `${dreamId}/migrated-${Date.now()}.${ext}`;
  const response = await fetch(`${supabaseUrl}/storage/v1/object/dream-images/${objectPath}`, {
    method: "POST",
    headers: { apikey: serviceRoleKey!, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": contentType },
    body: Buffer.from(base64, "base64"),
  });
  if (!response.ok) throw new Error(`Image upload failed: ${response.status} ${await response.text()}`);
  return `${supabaseUrl}/storage/v1/object/public/dream-images/${objectPath}`;
}

const db = new Database(dbPath, { readonly: true });
const profile = db.prepare("select * from user_profile where id = 1").get() as any;
const dreams = db.prepare("select * from dreams order by id asc").all() as any[];

console.log(`SQLite source: ${dbPath}`);
console.log(`Profile present: ${Boolean(profile)}`);
console.log(`Dreams found: ${dreams.length}`);

if (!execute) {
  console.log("Dry run only. Re-run with --execute to migrate.");
  process.exit(0);
}

const existing = await rest("dreams?select=id");
if (existing?.length) throw new Error(`Supabase already contains ${existing.length} dream(s). Refusing to overwrite.`);

if (profile) {
  await rest("user_profiles?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(profile),
  });
}

for (const row of dreams) {
  const { id: _oldId, image_url: oldImageUrl, ...restOfRow } = row;
  const dream = {
    ...restOfRow,
    planetary_influences: row.planetary_influences ? JSON.parse(row.planetary_influences) : null,
    tags: row.tags ? JSON.parse(row.tags) : [],
    notes: row.notes ? JSON.parse(row.notes) : [],
    image_url: null,
  };

  const inserted = await rest("dreams?select=id", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(dream),
  });
  const newId = inserted?.[0]?.id;
  if (!newId) throw new Error(`Supabase did not return an id for SQLite dream ${row.id}`);

  if (oldImageUrl) {
    const imageUrl = await uploadImage(oldImageUrl, newId);
    await rest(`dreams?id=eq.${newId}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ image_url: imageUrl }),
    });
  }
}

const migrated = await rest("dreams?select=id");
if (migrated.length !== dreams.length) {
  throw new Error(`Verification failed: expected ${dreams.length}, found ${migrated.length}`);
}

console.log(`Migration complete. Verified ${migrated.length} dream(s).`);
