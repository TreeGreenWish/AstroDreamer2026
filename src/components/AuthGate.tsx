import { useEffect, useMemo, useState } from 'react';
import { KeyRound, Loader2, LogOut, Moon, ShieldCheck } from 'lucide-react';
import { consumeAuthRedirect, getAccessToken, getCurrentUser, requestPasswordReset, signIn, signOut, signUp, updatePassword } from '../lib/authClient';

type AuthUser = { id: string; email?: string };
type AuthStatus = { authenticated: boolean; profile_exists: boolean; legacy_archive_available: boolean };

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

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center p-6 bg-[#0a0502]"><div className="atmosphere" /><div className="glass p-8 rounded-3xl w-full max-w-md relative z-10">{children}</div></div>;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [claimCode, setClaimCode] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot' | 'reset'>('signin');
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [showChangePassword, setShowChangePassword] = useState(false);

  const needsClaim = Boolean(user && status?.legacy_archive_available && !status?.profile_exists);
  const betaLocked = Boolean(user && status && !status.profile_exists && !status.legacy_archive_available);

  useEffect(() => {
    installAuthenticatedFetch();
    (async () => {
      try {
        const redirectType = consumeAuthRedirect();
        if (redirectType === 'recovery') setMode('reset');
        const current = await getCurrentUser();
        setUser(current);
        if (current) setStatus(await apiJson('/api/profile?auth_action=status'));
      } catch (error) {
        console.error('Auth bootstrap failed', error);
      } finally { setChecking(false); }
    })();
  }, []);

  const title = useMemo(() => {
    if (mode === 'signup') return 'Create your AstraDream account';
    if (mode === 'forgot') return 'Reset your password';
    if (mode === 'reset') return 'Choose a new password';
    return 'Enter your AstraDream archive';
  }, [mode]);

  async function submitAuth(event: React.FormEvent) {
    event.preventDefault(); setWorking(true); setMessage('');
    try {
      if (mode === 'signup') {
        const result = await signUp(email.trim(), password);
        if (!result.signedIn) { setMessage('Account created. Confirm your email, then sign in.'); setMode('signin'); return; }
      } else await signIn(email.trim(), password);
      const current = await getCurrentUser();
      setUser(current);
      if (current) setStatus(await apiJson('/api/profile?auth_action=status'));
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Authentication failed'); }
    finally { setWorking(false); }
  }

  async function sendRecovery(event: React.FormEvent) {
    event.preventDefault(); setWorking(true); setMessage('');
    try {
      await requestPasswordReset(email.trim());
      setMessage('Password reset email sent. Open the link in that email to choose a new password.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not send password reset email'); }
    finally { setWorking(false); }
  }

  async function saveNewPassword(event: React.FormEvent) {
    event.preventDefault(); setWorking(true); setMessage('');
    try {
      await updatePassword(newPassword);
      setNewPassword('');
      setShowChangePassword(false);
      setMode('signin');
      const current = await getCurrentUser();
      setUser(current);
      if (current) setStatus(await apiJson('/api/profile?auth_action=status'));
      setMessage('Password updated successfully.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Password update failed'); }
    finally { setWorking(false); }
  }

  async function claimArchive(event: React.FormEvent) {
    event.preventDefault(); setWorking(true); setMessage('');
    try {
      await apiJson('/api/profile?auth_action=claim-legacy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ claim_code: claimCode.trim() }) });
      setStatus(await apiJson('/api/profile?auth_action=status'));
      setMessage('Archive claimed successfully.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Archive claim failed'); }
    finally { setWorking(false); }
  }

  async function handleSignOut() {
    await signOut(); setUser(null); setStatus(null); setClaimCode(''); setMessage(''); setMode('signin'); setShowChangePassword(false);
  }

  if (checking) return <div className="h-screen w-screen flex items-center justify-center bg-[#0a0502]"><div className="atmosphere" /><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>;

  if (mode === 'reset') {
    return <Shell>
      <KeyRound className="w-12 h-12 text-gold mx-auto mb-4" />
      <h1 className="text-2xl font-serif text-white text-center mb-3">Choose a new password</h1>
      <p className="text-white/50 text-sm text-center mb-6">Your recovery link has been verified. Set a new password for this AstraDream account.</p>
      <form onSubmit={saveNewPassword} className="space-y-4">
        <input required minLength={8} type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New password" autoComplete="new-password" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500/50" />
        <button disabled={working} className="w-full bg-gold text-deep-blue font-bold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">{working && <Loader2 className="w-4 h-4 animate-spin" />}Update password</button>
      </form>
      {message && <p className="text-sm text-white/60 mt-4 text-center">{message}</p>}
    </Shell>;
  }

  if (!user) {
    return <Shell>
      <div className="text-center mb-8"><Moon className="w-12 h-12 text-gold mx-auto mb-4" /><h1 className="text-3xl font-serif text-white mb-2">{title}</h1><p className="text-white/50 text-sm">Your journal is private to your authenticated account.</p></div>
      {mode === 'forgot' ? <form onSubmit={sendRecovery} className="space-y-4">
        <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" autoComplete="email" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500/50" />
        <button disabled={working} className="w-full bg-gold text-deep-blue font-bold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">{working && <Loader2 className="w-4 h-4 animate-spin" />}Send reset email</button>
      </form> : <form onSubmit={submitAuth} className="space-y-4">
        <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" autoComplete="email" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500/50" />
        <input required minLength={8} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500/50" />
        <button disabled={working} className="w-full bg-gold text-deep-blue font-bold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">{working && <Loader2 className="w-4 h-4 animate-spin" />}{mode === 'signup' ? 'Create account' : 'Sign in'}</button>
      </form>}
      {message && <p className="text-sm text-white/60 mt-4 text-center">{message}</p>}
      {mode === 'forgot' ? <button onClick={() => { setMode('signin'); setMessage(''); }} className="w-full text-xs text-white/40 hover:text-white/70 mt-5">Back to sign in</button> : <>
        {mode === 'signin' && <button onClick={() => { setMode('forgot'); setMessage(''); }} className="w-full text-xs text-white/40 hover:text-white/70 mt-5">Forgot password?</button>}
        <button onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setMessage(''); }} className="w-full text-xs text-white/40 hover:text-white/70 mt-3">{mode === 'signup' ? 'Already have an account? Sign in' : 'Create an account'}</button>
      </>}
    </Shell>;
  }

  if (needsClaim) {
    return <Shell>
      <ShieldCheck className="w-12 h-12 text-gold mx-auto mb-4" />
      <h1 className="text-2xl font-serif text-white text-center mb-3">Claim your existing archive</h1>
      <p className="text-white/50 text-sm text-center mb-6">A legacy AstraDream journal is waiting to be attached to an authenticated account. Enter its one-time claim code.</p>
      <form onSubmit={claimArchive} className="space-y-4">
        <input required value={claimCode} onChange={e => setClaimCode(e.target.value)} placeholder="Archive claim code" autoComplete="off" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white font-mono focus:outline-none focus:border-orange-500/50" />
        <button disabled={working} className="w-full bg-gold text-deep-blue font-bold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">{working && <Loader2 className="w-4 h-4 animate-spin" />}Claim archive</button>
      </form>
      {message && <p className="text-sm text-white/60 mt-4 text-center">{message}</p>}
      <button onClick={handleSignOut} className="w-full text-xs text-white/40 hover:text-white/70 mt-5">Use a different account</button>
    </Shell>;
  }

  if (betaLocked) {
    return <Shell>
      <ShieldCheck className="w-12 h-12 text-gold mx-auto mb-4" />
      <h1 className="text-2xl font-serif text-white text-center mb-3">Private beta</h1>
      <p className="text-white/50 text-sm text-center">This account is authenticated but has not been invited into AstraDream yet. Access is intentionally closed while the private beta is being prepared.</p>
      <button onClick={handleSignOut} className="w-full mt-6 rounded-xl border border-white/10 py-3 text-sm text-white/60 hover:text-white">Sign out</button>
    </Shell>;
  }

  if (showChangePassword) {
    return <Shell>
      <KeyRound className="w-12 h-12 text-gold mx-auto mb-4" />
      <h1 className="text-2xl font-serif text-white text-center mb-3">Change password</h1>
      <p className="text-white/50 text-sm text-center mb-6">Your active session verifies your identity, so you can choose a new password without entering the old one.</p>
      <form onSubmit={saveNewPassword} className="space-y-4">
        <input required minLength={8} type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New password" autoComplete="new-password" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500/50" />
        <button disabled={working} className="w-full bg-gold text-deep-blue font-bold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">{working && <Loader2 className="w-4 h-4 animate-spin" />}Update password</button>
      </form>
      {message && <p className="text-sm text-white/60 mt-4 text-center">{message}</p>}
      <button onClick={() => { setShowChangePassword(false); setMessage(''); }} className="w-full text-xs text-white/40 hover:text-white/70 mt-5">Back to journal</button>
    </Shell>;
  }

  return <>{children}<div className="fixed top-6 right-6 z-[70] flex gap-2"><button onClick={() => { setShowChangePassword(true); setMessage(''); }} className="flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-2 text-[10px] uppercase tracking-widest text-white/40 backdrop-blur-md hover:text-white/70" title="Change password"><KeyRound className="h-3.5 w-3.5" />Password</button><button onClick={handleSignOut} className="flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-2 text-[10px] uppercase tracking-widest text-white/40 backdrop-blur-md hover:text-white/70" title={user.email || 'Sign out'}><LogOut className="h-3.5 w-3.5" />Sign out</button></div></>;
}
