import { useEffect, useMemo, useState } from 'react';
import { Loader2, LogOut, Moon, ShieldCheck } from 'lucide-react';
import { getAccessToken, getCurrentUser, signIn, signOut, signUp } from '../lib/authClient';

type AuthUser = { id: string; email?: string };

type AuthStatus = {
  authenticated: boolean;
  profile_exists: boolean;
  legacy_archive_available: boolean;
};

const nativeFetch = window.fetch.bind(window);
let fetchWrapped = false;

function installAuthenticatedFetch() {
  if (fetchWrapped) return;
  fetchWrapped = true;
  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const target = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const sameOriginApi = target.startsWith('/api/') || target.startsWith(`${window.location.origin}/api/`);
    if (!sameOriginApi) return nativeFetch(input, init);

    const token = await getAccessToken();
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return nativeFetch(input, { ...init, headers });
  };
}

async function apiJson(path: string, init: RequestInit = {}) {
  const response = await window.fetch(path, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || `Request failed (${response.status})`);
  return payload;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [claimCode, setClaimCode] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');

  const needsClaim = Boolean(user && status?.legacy_archive_available && !status?.profile_exists);

  useEffect(() => {
    installAuthenticatedFetch();
    (async () => {
      try {
        const current = await getCurrentUser();
        setUser(current);
        if (current) setStatus(await apiJson('/api/auth/status'));
      } catch (error) {
        console.error('Auth bootstrap failed', error);
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  const title = useMemo(() => mode === 'signup' ? 'Create your AstraDream account' : 'Enter your AstraDream archive', [mode]);

  async function submitAuth(event: React.FormEvent) {
    event.preventDefault();
    setWorking(true);
    setMessage('');
    try {
      if (mode === 'signup') {
        const result = await signUp(email.trim(), password);
        if (!result.signedIn) {
          setMessage('Account created. Confirm your email, then sign in.');
          setMode('signin');
          return;
        }
      } else {
        await signIn(email.trim(), password);
      }
      const current = await getCurrentUser();
      setUser(current);
      if (current) setStatus(await apiJson('/api/auth/status'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Authentication failed');
    } finally {
      setWorking(false);
    }
  }

  async function claimArchive(event: React.FormEvent) {
    event.preventDefault();
    setWorking(true);
    setMessage('');
    try {
      await apiJson('/api/auth/claim-legacy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claim_code: claimCode.trim() }),
      });
      setStatus(await apiJson('/api/auth/status'));
      setMessage('Archive claimed successfully.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Archive claim failed');
    } finally {
      setWorking(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    setUser(null);
    setStatus(null);
    setClaimCode('');
    setMessage('');
  }

  if (checking) {
    return <div className="h-screen w-screen flex items-center justify-center bg-[#0a0502]"><div className="atmosphere" /><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#0a0502]">
        <div className="atmosphere" />
        <div className="glass p-8 rounded-3xl w-full max-w-md relative z-10">
          <div className="text-center mb-8">
            <Moon className="w-12 h-12 text-gold mx-auto mb-4" />
            <h1 className="text-3xl font-serif text-white mb-2">{title}</h1>
            <p className="text-white/50 text-sm">Your journal is private to your authenticated account.</p>
          </div>
          <form onSubmit={submitAuth} className="space-y-4">
            <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500/50" />
            <input required minLength={8} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500/50" />
            <button disabled={working} className="w-full bg-gold text-deep-blue font-bold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">{working && <Loader2 className="w-4 h-4 animate-spin" />}{mode === 'signup' ? 'Create account' : 'Sign in'}</button>
          </form>
          {message && <p className="text-sm text-white/60 mt-4 text-center">{message}</p>}
          <button onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setMessage(''); }} className="w-full text-xs text-white/40 hover:text-white/70 mt-5">{mode === 'signup' ? 'Already have an account? Sign in' : 'Create an account'}</button>
        </div>
      </div>
    );
  }

  if (needsClaim) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#0a0502]">
        <div className="atmosphere" />
        <div className="glass p-8 rounded-3xl w-full max-w-md relative z-10">
          <ShieldCheck className="w-12 h-12 text-gold mx-auto mb-4" />
          <h1 className="text-2xl font-serif text-white text-center mb-3">Claim your existing archive</h1>
          <p className="text-white/50 text-sm text-center mb-6">A legacy AstraDream journal is waiting to be attached to an authenticated account. Enter its one-time claim code.</p>
          <form onSubmit={claimArchive} className="space-y-4">
            <input required value={claimCode} onChange={e => setClaimCode(e.target.value)} placeholder="Archive claim code" autoComplete="off" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white font-mono focus:outline-none focus:border-orange-500/50" />
            <button disabled={working} className="w-full bg-gold text-deep-blue font-bold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">{working && <Loader2 className="w-4 h-4 animate-spin" />}Claim archive</button>
          </form>
          {message && <p className="text-sm text-white/60 mt-4 text-center">{message}</p>}
          <button onClick={handleSignOut} className="w-full text-xs text-white/40 hover:text-white/70 mt-5">Use a different account</button>
        </div>
      </div>
    );
  }

  return (
    <>
      {children}
      <button onClick={handleSignOut} className="fixed top-6 right-6 z-[70] flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-2 text-[10px] uppercase tracking-widest text-white/40 backdrop-blur-md hover:text-white/70" title={user.email || 'Sign out'}><LogOut className="h-3.5 w-3.5" />Sign out</button>
    </>
  );
}
