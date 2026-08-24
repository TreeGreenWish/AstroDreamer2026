import type { AuthenticatedRequestUser } from "./requestAuth.js";

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "") || "https://wgtagrrvnieuzheggsis.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = "https://astro-dreamer2026.vercel.app";

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

async function sendMagicLink(email: string) {
  const response = await fetch(`${supabaseUrl}/auth/v1/otp?redirect_to=${encodeURIComponent(appUrl)}`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify({ email, create_user: false }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw Object.assign(new Error(`Could not send beta sign-in link (${response.status}): ${body}`), { status: response.status });
  }
  return { delivery: "magic_link" as const };
}

async function sendInviteEmail(email: string) {
  const response = await fetch(`${supabaseUrl}/auth/v1/invite?redirect_to=${encodeURIComponent(appUrl)}`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify({ email, data: { source: "astradream_private_beta" } }),
  });
  if (response.ok) return { delivery: "invite" as const };

  const body = await response.text();
  let errorCode = "";
  try {
    const payload = JSON.parse(body);
    errorCode = String(payload?.error_code || payload?.code || "");
  } catch {
    // Keep the raw response for the error below.
  }

  // Supabase's admin invite endpoint cannot send a second invite once an Auth
  // record exists. For invited users who have not finished onboarding, send a
  // passwordless sign-in link instead. It verifies/signs them in through their
  // own email and returns them to AstraDream; no manual account intervention.
  if (response.status === 422 && errorCode === "email_exists") {
    return sendMagicLink(email);
  }

  throw Object.assign(new Error(`Could not send beta invitation email (${response.status}): ${body}`), { status: response.status });
}

export type BetaAccess = {
  profileExists: boolean;
  invited: boolean;
  inviteAccepted: boolean;
};

export async function isBetaOwner(userId: string) {
  const rows = await rest<Array<{ id: number }>>(`legacy_archive_claims?user_id=eq.${encodeURIComponent(userId)}&used_at=not.is.null&select=id&limit=1`);
  return Boolean(rows[0]?.id);
}

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

export async function createBetaInvite(ownerUserId: string, rawEmail: string) {
  if (!(await isBetaOwner(ownerUserId))) throw Object.assign(new Error("Only the AstraDream owner can invite beta testers"), { status: 403 });
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error("Enter a valid email address"), { status: 400 });
  const existing = await rest<Array<{ id: number; revoked_at?: string | null; accepted_at?: string | null }>>(`beta_invites?email=ilike.${encodeURIComponent(email)}&select=id,revoked_at,accepted_at&limit=1`);
  if (existing[0]?.accepted_at) throw Object.assign(new Error("That tester has already joined the private beta"), { status: 409 });
  const invitedAt = new Date().toISOString();
  if (existing[0]?.id) {
    await rest(`beta_invites?id=eq.${existing[0].id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ revoked_at: null, invited_at: invitedAt, accepted_at: null, accepted_by: null }),
    });
  } else {
    await rest("beta_invites", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ email, invited_at: invitedAt }),
    });
  }
  const delivery = await sendInviteEmail(email);
  return { email, emailed: true, ...delivery };
}

export async function resendBetaInvite(ownerUserId: string, inviteId: number) {
  if (!(await isBetaOwner(ownerUserId))) throw Object.assign(new Error("Only the AstraDream owner can resend beta invitations"), { status: 403 });
  const rows = await rest<Array<{ id: number; email: string; accepted_at?: string | null; revoked_at?: string | null }>>(
    `beta_invites?id=eq.${inviteId}&select=id,email,accepted_at,revoked_at&limit=1`,
  );
  const invite = rows[0];
  if (!invite) throw Object.assign(new Error("Invitation not found"), { status: 404 });
  if (invite.accepted_at) throw Object.assign(new Error("That tester has already joined"), { status: 409 });
  const invitedAt = new Date().toISOString();
  await rest(`beta_invites?id=eq.${invite.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ revoked_at: null, invited_at: invitedAt, accepted_at: null, accepted_by: null }),
  });
  const delivery = await sendInviteEmail(invite.email);
  return { email: invite.email, emailed: true, ...delivery };
}

export async function revokeBetaInvite(ownerUserId: string, inviteId: number) {
  if (!(await isBetaOwner(ownerUserId))) throw Object.assign(new Error("Only the AstraDream owner can remove beta invitations"), { status: 403 });
  const rows = await rest<Array<{ id: number; email: string; accepted_at?: string | null }>>(
    `beta_invites?id=eq.${inviteId}&select=id,email,accepted_at&limit=1`,
  );
  const invite = rows[0];
  if (!invite) throw Object.assign(new Error("Invitation not found"), { status: 404 });
  if (invite.accepted_at) throw Object.assign(new Error("This tester has already joined. Removing their account requires the separate account-removal flow."), { status: 409 });
  await rest(`beta_invites?id=eq.${invite.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ revoked_at: new Date().toISOString() }),
  });
  return { email: invite.email, revoked: true };
}

export async function listBetaInvites(ownerUserId: string) {
  if (!(await isBetaOwner(ownerUserId))) throw Object.assign(new Error("Only the AstraDream owner can view beta invitations"), { status: 403 });
  return rest<Array<{ id: number; email: string; invited_at: string; accepted_at?: string | null; revoked_at?: string | null }>>(
    "beta_invites?select=id,email,invited_at,accepted_at,revoked_at&order=invited_at.desc",
  );
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
