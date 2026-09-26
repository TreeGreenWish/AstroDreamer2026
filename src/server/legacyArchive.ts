import { createHash } from "node:crypto";

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function headers(extra: Record<string, string> = {}) {
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export async function legacyArchiveAvailable() {
  if (!supabaseUrl) throw new Error("SUPABASE_URL is not configured");
  const response = await fetch(`${supabaseUrl}/rest/v1/legacy_archive_claims?id=eq.1&select=used_at&limit=1`, { headers: headers() });
  if (!response.ok) throw new Error(`Legacy claim status failed (${response.status}): ${await response.text()}`);
  const rows = await response.json() as Array<{ used_at: string | null }>;
  return Boolean(rows[0] && !rows[0].used_at);
}

export async function claimLegacyArchive(userId: string, claimCode: string) {
  if (!supabaseUrl) throw new Error("SUPABASE_URL is not configured");
  if (!claimCode || claimCode.length < 12) throw new Error("Invalid archive claim code");
  const tokenHash = createHash("sha256").update(claimCode).digest("hex");
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/claim_legacy_archive`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ p_user_id: userId, p_token_hash: tokenHash }),
  });
  if (!response.ok) {
    const detail = await response.text();
    if (/Invalid archive claim code/i.test(detail)) throw new Error("Invalid archive claim code");
    if (/already been claimed/i.test(detail)) throw new Error("Legacy archive has already been claimed");
    throw new Error(`Archive claim failed (${response.status})`);
  }
  return response.json();
}
