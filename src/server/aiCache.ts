import { createHash } from "node:crypto";

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const memoryCache = new Map<string, { payload: unknown; expiresAt: number | null }>();

type CacheRow<T> = {
  cache_key: string;
  cache_type: string;
  payload: T;
  expires_at: string | null;
};

function headers(extra: Record<string, string> = {}) {
  if (!supabaseServiceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return {
    apikey: supabaseServiceRoleKey,
    Authorization: `Bearer ${supabaseServiceRoleKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export function hashObject(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function getCached<T>(cacheKey: string): Promise<T | null> {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    const cached = memoryCache.get(cacheKey);
    if (!cached) return null;
    if (cached.expiresAt && cached.expiresAt <= Date.now()) {
      memoryCache.delete(cacheKey);
      return null;
    }
    return cached.payload as T;
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/ai_cache?cache_key=eq.${encodeURIComponent(cacheKey)}&select=*&limit=1`, {
    headers: headers(),
  });
  if (!response.ok) throw new Error(`AI cache read failed (${response.status}): ${await response.text()}`);
  const rows = await response.json() as CacheRow<T>[];
  const cached = rows[0];
  if (!cached) return null;

  if (cached.expires_at && new Date(cached.expires_at).getTime() <= Date.now()) {
    await deleteCached(cacheKey);
    return null;
  }
  return cached.payload;
}

export async function setCached<T>(cacheKey: string, cacheType: string, payload: T, expiresAt: Date | null = null) {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    memoryCache.set(cacheKey, { payload, expiresAt: expiresAt?.getTime() ?? null });
    return;
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/ai_cache?on_conflict=cache_key`, {
    method: "POST",
    headers: headers({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({
      cache_key: cacheKey,
      cache_type: cacheType,
      payload,
      expires_at: expiresAt?.toISOString() ?? null,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!response.ok) throw new Error(`AI cache write failed (${response.status}): ${await response.text()}`);
}

export async function deleteCached(cacheKey: string) {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    memoryCache.delete(cacheKey);
    return;
  }
  const response = await fetch(`${supabaseUrl}/rest/v1/ai_cache?cache_key=eq.${encodeURIComponent(cacheKey)}`, {
    method: "DELETE",
    headers: headers({ Prefer: "return=minimal" }),
  });
  if (!response.ok) throw new Error(`AI cache delete failed (${response.status}): ${await response.text()}`);
}

export function endOfLocalDay(dateString: string) {
  const d = new Date(`${dateString}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? new Date(Date.now() + 12 * 60 * 60 * 1000) : d;
}

export function nextMonthBoundary(year: string, month: string) {
  const months = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  const index = months.indexOf(String(month).toLowerCase());
  const y = Number(year);
  if (index < 0 || !Number.isFinite(y)) return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return new Date(Date.UTC(index === 11 ? y + 1 : y, (index + 1) % 12, 1));
}
