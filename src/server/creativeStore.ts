const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "") || "https://wgtagrrvnieuzheggsis.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type CreativeStatus = "seed" | "draft" | "developing" | "finished";
export type CreativeEntry = {
  id?: number;
  user_id?: string;
  title: string;
  body: string;
  tags: string[];
  status: CreativeStatus;
  source_prompt?: string | null;
  source_dream_id?: number | null;
  created_at?: string;
  updated_at?: string;
};

function headers(extra: Record<string, string> = {}) {
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json", ...extra };
}

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers: { ...headers(), ...(init.headers || {}) } });
  if (!response.ok) throw new Error(`Creative journal request failed (${response.status}): ${await response.text()}`);
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return text ? JSON.parse(text) : (undefined as T);
}

function cleanEntry(input: any): CreativeEntry {
  const allowed: CreativeStatus[] = ["seed", "draft", "developing", "finished"];
  const tags = Array.isArray(input?.tags) ? input.tags.map((v: unknown) => String(v).trim().slice(0, 60)).filter(Boolean).slice(0, 30) : [];
  return {
    title: String(input?.title || "").trim().slice(0, 300),
    body: String(input?.body || "").slice(0, 100000),
    tags: Array.from(new Set(tags)),
    status: allowed.includes(input?.status) ? input.status : "draft",
    source_prompt: input?.source_prompt ? String(input.source_prompt).slice(0, 10000) : null,
    source_dream_id: Number.isInteger(Number(input?.source_dream_id)) ? Number(input.source_dream_id) : null,
  };
}

async function verifiedDreamId(userId: string, dreamId?: number | null) {
  if (!dreamId) return null;
  const rows = await rest<Array<{ id: number }>>(`dreams?id=eq.${dreamId}&user_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`);
  return rows[0]?.id || null;
}

export async function listCreativeEntries(userId: string) {
  return rest<CreativeEntry[]>(`creative_entries?user_id=eq.${encodeURIComponent(userId)}&select=*&order=updated_at.desc`);
}

export async function createCreativeEntry(userId: string, input: any) {
  const entry = cleanEntry(input);
  entry.source_dream_id = await verifiedDreamId(userId, entry.source_dream_id);
  const rows = await rest<CreativeEntry[]>("creative_entries?select=*", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...entry, user_id: userId }),
  });
  if (!rows[0]) throw new Error("Creative entry was not created");
  return rows[0];
}

export async function updateCreativeEntry(userId: string, id: number, input: any) {
  const currentRows = await rest<CreativeEntry[]>(`creative_entries?id=eq.${id}&user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`);
  const current = currentRows[0];
  if (!current) throw Object.assign(new Error("Creative entry not found"), { status: 404 });
  const next = cleanEntry({ ...current, ...input });
  next.source_dream_id = await verifiedDreamId(userId, next.source_dream_id);

  const changed = current.title !== next.title || current.body !== next.body || current.status !== next.status || JSON.stringify(current.tags || []) !== JSON.stringify(next.tags || []);
  if (changed) {
    const recent = await rest<Array<{ created_at: string }>>(`creative_entry_versions?entry_id=eq.${id}&user_id=eq.${encodeURIComponent(userId)}&select=created_at&order=created_at.desc&limit=1`);
    const lastAt = recent[0]?.created_at ? new Date(recent[0].created_at).getTime() : 0;
    if (!lastAt || Date.now() - lastAt > 5 * 60 * 1000 || current.status !== next.status) {
      await rest("creative_entry_versions", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ entry_id: id, user_id: userId, title: current.title, body: current.body, tags: current.tags || [], status: current.status }),
      });
    }
  }

  const rows = await rest<CreativeEntry[]>(`creative_entries?id=eq.${id}&user_id=eq.${encodeURIComponent(userId)}&select=*`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...next, updated_at: new Date().toISOString() }),
  });
  if (!rows[0]) throw Object.assign(new Error("Creative entry not found"), { status: 404 });
  return rows[0];
}

export async function deleteCreativeEntry(userId: string, id: number) {
  await rest(`creative_entries?id=eq.${id}&user_id=eq.${encodeURIComponent(userId)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
}

export async function listCreativeVersions(userId: string, id: number) {
  const owned = await rest<Array<{ id: number }>>(`creative_entries?id=eq.${id}&user_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`);
  if (!owned[0]) throw Object.assign(new Error("Creative entry not found"), { status: 404 });
  return rest(`creative_entry_versions?entry_id=eq.${id}&user_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.desc&limit=50`);
}
