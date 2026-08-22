import type { AuthenticatedRequestUser } from "./requestAuth.js";

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "") || "https://wgtagrrvnieuzheggsis.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function serviceHeaders(extra: Record<string, string> = {}) {
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: { ...serviceHeaders(), ...(init.headers || {}) },
  });
  if (!response.ok) throw new Error(`Private beta lookup failed (${response.status}): ${await response.text()}`);
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return text ? JSON.parse(text) : (undefined as T);
}

export type BetaAccess = {
  profileExists: boolean;
  invited: boolean;
  inviteAccepted: boolean;
};

export async function getBetaAccess(user: AuthenticatedRequestUser): Promise<BetaAccess> {
  const profiles = await rest<Array<{ id: number }>>(`user_profiles?user_id=eq.${encodeURIComponent(user.id)}&select=id&limit=1`);
  const profileExists = Boolean(profiles[0]?.id);
  if (profileExists) return { profileExists: true, invited: true, inviteAccepted: true };

  if (!user.email) return { profileExists: false, invited: false, inviteAccepted: false };
  const email = user.email.trim().toLowerCase();
  const invites = await rest<Array<{ id: number; accepted_at?: string | null; accepted_by?: string | null }>>(
    `beta_invites?email=ilike.${encodeURIComponent(email)}&revoked_at=is.null&select=id,accepted_at,accepted_by&limit=1`,
  );
  const invite = invites[0];
  if (!invite) return { profileExists: false, invited: false, inviteAccepted: false };
  if (invite.accepted_by && invite.accepted_by !== user.id) return { profileExists: false, invited: false, inviteAccepted: false };
  return { profileExists: false, invited: true, inviteAccepted: Boolean(invite.accepted_at) };
}

export async function acceptBetaInvite(user: AuthenticatedRequestUser) {
  if (!user.email) throw Object.assign(new Error("Account email is required for private beta access"), { status: 403 });
  const email = user.email.trim().toLowerCase();
  const rows = await rest<Array<{ id: number; accepted_by?: string | null }>>(
    `beta_invites?email=ilike.${encodeURIComponent(email)}&revoked_at=is.null&select=id,accepted_by&limit=1`,
  );
  const invite = rows[0];
  if (!invite || (invite.accepted_by && invite.accepted_by !== user.id)) {
    throw Object.assign(new Error("This account has not been invited to the private beta"), { status: 403 });
  }
  await rest(`beta_invites?id=eq.${invite.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ accepted_at: new Date().toISOString(), accepted_by: user.id }),
  });
}

export async function requireBetaAccess(user: AuthenticatedRequestUser) {
  const access = await getBetaAccess(user);
  if (!access.profileExists && !access.invited) {
    throw Object.assign(new Error("Private beta invitation required"), { status: 403 });
  }
  return access;
}

export async function saveBetaFeedback(userId: string, category: string, message: string, page?: string) {
  const clean = message.trim();
  if (!clean) throw Object.assign(new Error("Feedback message is required"), { status: 400 });
  if (clean.length > 5000) throw Object.assign(new Error("Feedback is too long"), { status: 400 });
  await rest("beta_feedback", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ user_id: userId, category: category || "general", message: clean, page: page || null }),
  });
}
