import { isBetaOwner } from "./betaAccess.js";

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "") || "https://wgtagrrvnieuzheggsis.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function headers(extra: Record<string, string> = {}) {
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json", ...extra };
}

async function rest<T>(path: string): Promise<T> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers: headers() });
  if (!response.ok) throw new Error(`Feedback inbox request failed (${response.status}): ${await response.text()}`);
  const text = await response.text();
  return text ? JSON.parse(text) : ([] as unknown as T);
}

export async function listOwnerFeedback(ownerUserId: string) {
  if (!(await isBetaOwner(ownerUserId))) throw Object.assign(new Error("Only the AstroDreamer owner can view beta feedback"), { status: 403 });
  const [feedback, invites] = await Promise.all([
    rest<any[]>("beta_feedback?select=id,user_id,category,message,page,created_at&order=created_at.desc&limit=100"),
    rest<any[]>("beta_invites?select=email,accepted_by,auth_user_id"),
  ]);
  const emailByUser = new Map<string, string>();
  for (const invite of invites) {
    if (invite.accepted_by) emailByUser.set(invite.accepted_by, invite.email);
    if (invite.auth_user_id) emailByUser.set(invite.auth_user_id, invite.email);
  }
  return feedback.map(row => ({ ...row, email: emailByUser.get(row.user_id) || null }));
}
