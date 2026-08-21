const SUPABASE_URL = 'https://wgtagrrvnieuzheggsis.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_6XhsHFkPQukuQineOtvLeQ_14GlU3BT';
const STORAGE_KEY = 'astradream.auth.session.v1';
const PRODUCTION_APP_URL = 'https://astro-dreamer2026.vercel.app/';

type SupabaseUser = { id: string; email?: string };

type StoredSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user?: SupabaseUser;
};

let session: StoredSession | null = null;

function persist(next: StoredSession | null) {
  session = next;
  if (typeof window === 'undefined') return;
  if (next) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  else window.localStorage.removeItem(STORAGE_KEY);
}

function loadStored() {
  if (session) return session;
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.access_token || !parsed?.refresh_token) return null;
    session = parsed;
    return parsed;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

async function authRequest(path: string, init: RequestInit = {}) {
  return window.fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

function toStoredSession(payload: any): StoredSession {
  const expiresIn = Number(payload?.expires_in || 3600);
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    user: payload.user,
  };
}

export async function signIn(email: string, password: string) {
  const response = await authRequest('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.msg || payload?.error_description || payload?.message || 'Sign in failed');
  const next = toStoredSession(payload);
  persist(next);
  return next.user || null;
}

export async function signUp(email: string, password: string) {
  const response = await authRequest(`/auth/v1/signup?redirect_to=${encodeURIComponent(PRODUCTION_APP_URL)}`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.msg || payload?.error_description || payload?.message || 'Sign up failed');
  if (payload?.access_token && payload?.refresh_token) {
    persist(toStoredSession(payload));
    return { user: payload.user as SupabaseUser, signedIn: true };
  }
  return { user: payload.user as SupabaseUser, signedIn: false };
}

async function refreshSession(current: StoredSession) {
  const response = await authRequest('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: current.refresh_token }),
  });
  const payload = await response.json();
  if (!response.ok) {
    persist(null);
    throw new Error(payload?.msg || payload?.message || 'Session expired');
  }
  const next = toStoredSession(payload);
  persist(next);
  return next;
}

export async function getSession() {
  const current = loadStored();
  if (!current) return null;
  if (current.expires_at > Math.floor(Date.now() / 1000) + 90) return current;
  return refreshSession(current);
}

export async function getCurrentUser() {
  const current = await getSession();
  if (!current) return null;
  const response = await authRequest('/auth/v1/user', {
    headers: { Authorization: `Bearer ${current.access_token}` },
  });
  if (!response.ok) {
    persist(null);
    return null;
  }
  const user = await response.json() as SupabaseUser;
  persist({ ...current, user });
  return user;
}

export async function getAccessToken() {
  return (await getSession())?.access_token || null;
}

export async function signOut() {
  const current = loadStored();
  try {
    if (current?.access_token) {
      await authRequest('/auth/v1/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${current.access_token}` },
      });
    }
  } finally {
    persist(null);
  }
}
