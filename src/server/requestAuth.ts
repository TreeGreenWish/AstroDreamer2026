export interface AuthenticatedRequestUser {
  id: string;
  email?: string;
}

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "") || "https://wgtagrrvnieuzheggsis.supabase.co";
// Publishable keys are designed to be public. Keep service-role credentials server-only.
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_6XhsHFkPQukuQineOtvLeQ_14GlU3BT";

function bearerToken(req: any) {
  const raw = req?.headers?.authorization || req?.headers?.Authorization;
  if (!raw || typeof raw !== "string") return null;
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function authenticatedUserFromRequest(req: any): Promise<AuthenticatedRequestUser | null> {
  const token = bearerToken(req);
  if (!token) return null;

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) return null;
  const user = await response.json();
  if (!user?.id || typeof user.id !== "string") return null;
  return { id: user.id, email: typeof user.email === "string" ? user.email : undefined };
}

export async function requireAuthenticatedUser(req: any): Promise<AuthenticatedRequestUser> {
  const user = await authenticatedUserFromRequest(req);
  if (!user) {
    const error = new Error("Authentication required") as Error & { status?: number };
    error.status = 401;
    throw error;
  }
  return user;
}

export async function requirePrivateBetaUser(req: any): Promise<AuthenticatedRequestUser> {
  const user = await requireAuthenticatedUser(req);
  const { requireBetaAccess } = await import("./betaAccess.js");
  await requireBetaAccess(user);
  return user;
}
