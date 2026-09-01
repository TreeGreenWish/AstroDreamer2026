import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
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

async function authAdmin<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/${path}`, {
    ...init,
    headers: { ...serviceHeaders(), ...(init.headers || {}) },
  });
  const text = await response.text();
  if (!response.ok) {
    let message = text || `Supabase Auth admin request failed (${response.status})`;
    try {
      const payload = JSON.parse(text);
      message = payload?.msg || payload?.message || payload?.error_description || message;
    } catch {
      // Keep raw response.
    }
    throw Object.assign(new Error(message), { status: response.status });
  }
  return text ? JSON.parse(text) : (undefined as T);
}

function normalizeEmail(raw: string) {
  const email = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error("Enter a valid email address"), { status: 400 });
  return email;
}

function validatePassword(password: string) {
  if (password.length < 8) throw Object.assign(new Error("Password must be at least 8 characters"), { status: 400 });
}

function newCode() {
  return randomBytes(18).toString("base64url");
}

function hashCode(code: string) {
  return createHash("sha256").update(code.trim()).digest("hex");
}

function validCode(raw: string, storedHash?: string | null) {
  if (!raw || !storedHash) return false;
  const candidate = Buffer.from(hashCode(raw), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function ensureNotExpired(value?: string | null) {
  return Boolean(value && new Date(value).getTime() > Date.now());
}

export type BetaAccess = {
  profileExists: boolean;
  invited: boolean;
  inviteAccepted: boolean;
};

type InviteRow = {
  id: number;
  email: string;
  auth_user_id?: string | null;
  invited_at: string;
  accepted_at?: string | null;
  accepted_by?: string | null;
  revoked_at?: string | null;
  setup_code_hash?: string | null;
  setup_code_expires_at?: string | null;
  setup_code_used_at?: string | null;
  recovery_code_hash?: string | null;
  recovery_code_expires_at?: string | null;
  recovery_code_used_at?: string | null;
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
    body: JSON.stringify({ accepted_at: new Date().toISOString(), accepted_by: user.id, auth_user_id: user.id }),
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
  if (!(await isBetaOwner(ownerUserId))) throw Object.assign(new Error("Only the AstraDream owner can create beta access codes"), { status: 403 });
  const email = normalizeEmail(rawEmail);
  const existing = await rest<InviteRow[]>(`beta_invites?email=ilike.${encodeURIComponent(email)}&select=*&limit=1`);
  if (existing[0]?.accepted_at) throw Object.assign(new Error("That tester has already joined. Generate a recovery code instead."), { status: 409 });

  const code = newCode();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const invitedAt = new Date().toISOString();
  const patch = {
    revoked_at: null,
    invited_at: invitedAt,
    accepted_at: null,
    accepted_by: null,
    setup_code_hash: hashCode(code),
    setup_code_expires_at: expiresAt,
    setup_code_used_at: null,
  };
  if (existing[0]?.id) {
    await rest(`beta_invites?id=eq.${existing[0].id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    });
  } else {
    await rest("beta_invites", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ email, ...patch }),
    });
  }
  return { email, code, expires_at: expiresAt };
}

export async function resendBetaInvite(ownerUserId: string, inviteId: number) {
  if (!(await isBetaOwner(ownerUserId))) throw Object.assign(new Error("Only the AstraDream owner can regenerate setup codes"), { status: 403 });
  const rows = await rest<InviteRow[]>(`beta_invites?id=eq.${inviteId}&select=*&limit=1`);
  const invite = rows[0];
  if (!invite) throw Object.assign(new Error("Tester not found"), { status: 404 });
  if (invite.accepted_at) throw Object.assign(new Error("That tester has already joined. Generate a recovery code instead."), { status: 409 });

  const code = newCode();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await rest(`beta_invites?id=eq.${invite.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      revoked_at: null,
      invited_at: new Date().toISOString(),
      setup_code_hash: hashCode(code),
      setup_code_expires_at: expiresAt,
      setup_code_used_at: null,
    }),
  });
  return { email: invite.email, code, expires_at: expiresAt };
}

export async function createRecoveryCode(ownerUserId: string, inviteId: number) {
  if (!(await isBetaOwner(ownerUserId))) throw Object.assign(new Error("Only the AstraDream owner can create recovery codes"), { status: 403 });
  const rows = await rest<InviteRow[]>(`beta_invites?id=eq.${inviteId}&select=*&limit=1`);
  const invite = rows[0];
  if (!invite) throw Object.assign(new Error("Tester not found"), { status: 404 });
  if (invite.revoked_at) throw Object.assign(new Error("That tester is currently removed from the beta"), { status: 409 });
  if (!invite.auth_user_id) throw Object.assign(new Error("This tester does not have an Auth account yet. Give them a setup code instead."), { status: 409 });

  const code = newCode();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await rest(`beta_invites?id=eq.${invite.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      recovery_code_hash: hashCode(code),
      recovery_code_expires_at: expiresAt,
      recovery_code_used_at: null,
    }),
  });
  return { email: invite.email, code, expires_at: expiresAt };
}

export async function redeemSetupCode(rawEmail: string, rawCode: string, password: string) {
  const email = normalizeEmail(rawEmail);
  validatePassword(password);
  const rows = await rest<InviteRow[]>(`beta_invites?email=ilike.${encodeURIComponent(email)}&revoked_at=is.null&select=*&limit=1`);
  const invite = rows[0];
  if (!invite || invite.setup_code_used_at || !ensureNotExpired(invite.setup_code_expires_at) || !validCode(rawCode, invite.setup_code_hash)) {
    throw Object.assign(new Error("That setup code is invalid or expired"), { status: 403 });
  }

  let userId = invite.auth_user_id || null;
  if (userId) {
    await authAdmin(`users/${encodeURIComponent(userId)}`, {
      method: "PUT",
      body: JSON.stringify({ password, email_confirm: true }),
    });
  } else {
    const created = await authAdmin<{ id?: string; user?: { id?: string } }>("users", {
      method: "POST",
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    userId = created?.id || created?.user?.id || null;
    if (!userId) throw new Error("Supabase created the beta account but did not return its user ID");
  }

  await rest(`beta_invites?id=eq.${invite.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      auth_user_id: userId,
      setup_code_used_at: new Date().toISOString(),
      setup_code_hash: null,
    }),
  });
  return { email, ready: true };
}

export async function redeemRecoveryCode(rawEmail: string, rawCode: string, password: string) {
  const email = normalizeEmail(rawEmail);
  validatePassword(password);
  const rows = await rest<InviteRow[]>(`beta_invites?email=ilike.${encodeURIComponent(email)}&revoked_at=is.null&select=*&limit=1`);
  const invite = rows[0];
  if (!invite?.auth_user_id || invite.recovery_code_used_at || !ensureNotExpired(invite.recovery_code_expires_at) || !validCode(rawCode, invite.recovery_code_hash)) {
    throw Object.assign(new Error("That recovery code is invalid or expired"), { status: 403 });
  }

  await authAdmin(`users/${encodeURIComponent(invite.auth_user_id)}`, {
    method: "PUT",
    body: JSON.stringify({ password, email_confirm: true }),
  });
  await rest(`beta_invites?id=eq.${invite.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      recovery_code_used_at: new Date().toISOString(),
      recovery_code_hash: null,
    }),
  });
  return { email, ready: true };
}

export async function revokeBetaInvite(ownerUserId: string, inviteId: number) {
  if (!(await isBetaOwner(ownerUserId))) throw Object.assign(new Error("Only the AstraDream owner can remove beta testers"), { status: 403 });
  const rows = await rest<InviteRow[]>(`beta_invites?id=eq.${inviteId}&select=*&limit=1`);
  const invite = rows[0];
  if (!invite) throw Object.assign(new Error("Tester not found"), { status: 404 });
  if (invite.accepted_at) throw Object.assign(new Error("This tester has already joined. Removing their account requires the separate account-removal flow."), { status: 409 });
  await rest(`beta_invites?id=eq.${invite.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      revoked_at: new Date().toISOString(),
      setup_code_hash: null,
      recovery_code_hash: null,
    }),
  });
  return { email: invite.email, revoked: true };
}

export async function listBetaInvites(ownerUserId: string) {
  if (!(await isBetaOwner(ownerUserId))) throw Object.assign(new Error("Only the AstraDream owner can view beta testers"), { status: 403 });
  const rows = await rest<InviteRow[]>(
    "beta_invites?select=id,email,auth_user_id,invited_at,accepted_at,revoked_at,setup_code_expires_at,setup_code_used_at,recovery_code_expires_at,recovery_code_used_at&order=invited_at.desc",
  );
  return rows.map(row => ({
    id: row.id,
    email: row.email,
    invited_at: row.invited_at,
    accepted_at: row.accepted_at,
    revoked_at: row.revoked_at,
    has_account: Boolean(row.auth_user_id),
    setup_pending: Boolean(row.setup_code_expires_at && !row.setup_code_used_at && new Date(row.setup_code_expires_at).getTime() > Date.now()),
    recovery_pending: Boolean(row.recovery_code_expires_at && !row.recovery_code_used_at && new Date(row.recovery_code_expires_at).getTime() > Date.now()),
  }));
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
