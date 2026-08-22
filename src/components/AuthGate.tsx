import { useEffect, useMemo, useState } from 'react';
import { KeyRound, Loader2, LogOut, MessageSquare, Moon, ShieldCheck, UserPlus } from 'lucide-react';
import { consumeAuthRedirect, getAccessToken, getCurrentUser, requestPasswordReset, signIn, signOut, signUp, updatePassword } from '../lib/authClient';

type AuthUser = { id: string; email?: string };
type AuthStatus = { authenticated: boolean; profile_exists: boolean; legacy_archive_available: boolean; invited?: boolean; invite_accepted?: boolean; is_owner?: boolean };
type Invite = { id: number; email: string; invited_at: string; accepted_at?: string | null; revoked_at?: string | null };

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
  const [panel, setPanel] = useState<'password' | 'feedback' | 'beta' | 'account' | null>(null);
  const [feedback, setFeedback] = useState('');
  const [feedbackCategory, setFeedbackCategory] = useState('general');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invites, setInvites] = useState<Invite[]>([]);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  const needsClaim = Boolean(user && status?.legacy_archive_available && !status?.profile_exists);
  const betaLocked = Boolean(user && status && !status.profile_exists && !status.legacy_archive_available && !status.invited);

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
    if (mode === 'signup') return 'Join the AstraDream private beta';
    if (mode === 'forgot') return 'Reset your password';
    if (mode === 'reset') return 'Choose a new password';
    return 'Enter your AstraDream archive';
  }, [mode]);

  async function refreshStatus() {
    const next = await apiJson('/api/profile?auth_action=status');
    setStatus(next);
    return next as AuthStatus;
  }

  async function submitAuth(event: React.FormEvent) {
    event.preventDefault(); setWorking(true); setMessage('');
    try {
      if (mode === 'signup') {
        const result = await signUp(email.trim(), password);
        if (!result.signedIn) { setMessage('Account created. Confirm your email, then sign in. Access opens only for invited emails.'); setMode('signin'); return; }
      } else await signIn(email.trim(), password);
      const current = await getCurrentUser();
      setUser(current);
      if (current) await refreshStatus();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Authentication failed'); }
    finally { setWorking(false); }
  }

  async function sendRecovery(event: React.FormEvent) {
    event.preventDefault(); setWorking(true); setMessage('');
    try { await requestPasswordReset(email.trim()); setMessage('Password reset email sent. Open the link in that email to choose a new password.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not send password reset email'); }
    finally { setWorking(false); }
  }

  async function saveNewPassword(event: React.FormEvent) {
    event.preventDefault(); setWorking(true); setMessage('');
    try {
      await updatePassword(newPassword); setNewPassword(''); setPanel(null); setMode('signin');
      const current = await getCurrentUser(); setUser(current); if (current) await refreshStatus();
      setMessage('Password updated successfully.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Password update failed'); }
    finally { setWorking(false); }
  }

  async function claimArchive(event: React.FormEvent) {
    event.preventDefault(); setWorking(true); setMessage('');
    try {
      await apiJson('/api/profile?auth_action=claim-legacy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ claim_code: claimCode.trim() }) });
      await refreshStatus(); setMessage('Archive claimed successfully.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Archive claim failed'); }
    finally { setWorking(false); }
  }

  async function submitFeedback(event: React.FormEvent) {
    event.preventDefault(); setWorking(true); setMessage('');
    try {
      await apiJson('/api/profile?auth_action=feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category: feedbackCategory, message: feedback, page: window.location.pathname }) });
      setFeedback(''); setMessage('Feedback saved. Thank you.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save feedback'); }
    finally { setWorking(false); }
  }

  async function loadInvites() {
    const rows = await apiJson('/api/profile?auth_action=invite');
    setInvites(Array.isArray(rows) ? rows : []);
  }

  async function submitInvite(event: React.FormEvent) {
    event.preventDefault(); setWorking(true); setMessage('');
    try {
      await apiJson('/api/profile?auth_action=invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: inviteEmail }) });
      setInviteEmail(''); await loadInvites(); setMessage('Email admitted to the private beta. They can now create an account with that exact email.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not create invitation'); }
    finally { setWorking(false); }
  }

  async function deleteAccount(event: React.FormEvent) {
    event.preventDefault(); setWorking(true); setMessage('');
    try {
      await apiJson('/api/profile?auth_action=delete-account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmation: deleteConfirmation }) });
      await signOut().catch(() => undefined); setUser(null); setStatus(null); setPanel(null); setMode('signin'); setMessage('Account and AstraDream data deleted.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Account deletion failed'); }
    finally { setWorking(false); }
  }

  async function handleSignOut() {
    await signOut(); setUser(null); setStatus(null); setClaimCode(''); setMessage(''); setMode('signin'); setPanel(null);
  }

  if (checking) return <div className="h-screen w-screen flex items-center justify-center bg-[#0a0502]"><div className="atmosphere" /><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>;

  if (mode === 'reset') return <Shell><KeyRound className="w-12 h-12 text-gold mx-auto mb-4" /><h1 className="text-2xl font-serif text-white text-center mb-3">Choose a new password</h1><p className="text-white/50 text-sm text-center mb-6">Your recovery link has been verified.</p><form onSubmit={saveNewPassword} className="space-y-4"><input required minLength={8} type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New password" autoComplete="new-password" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500/50" /><button disabled={working} className="w-full bg-gold text-deep-blue font-bold py-3 rounded-xl">Update password</button></form>{message && <p className="text-sm text-white/60 mt-4 text-center">{message}</p>}</Shell>;

  if (!user) return <Shell><div className="text-center mb-8"><Moon className="w-12 h-12 text-gold mx-auto mb-4" /><h1 className="text-3xl font-serif text-white mb-2">{title}</h1><p className="text-white/50 text-sm">AstraDream is currently invite-only.</p></div>{mode === 'forgot' ? <form onSubmit={sendRecovery} className="space-y-4"><input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" autoComplete="email" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white" /><button disabled={working} className="w-full bg-gold text-deep-blue font-bold py-3 rounded-xl">Send reset email</button></form> : <form onSubmit={submitAuth} className="space-y-4"><input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" autoComplete="email" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white" /><input required minLength={8} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white" /><button disabled={working} className="w-full bg-gold text-deep-blue font-bold py-3 rounded-xl">{mode === 'signup' ? 'Create account' : 'Sign in'}</button></form>}{message && <p className="text-sm text-white/60 mt-4 text-center">{message}</p>}{mode === 'forgot' ? <button onClick={() => setMode('signin')} className="w-full text-xs text-white/40 mt-5">Back to sign in</button> : <><button onClick={() => setMode('forgot')} className="w-full text-xs text-white/40 mt-5">Forgot password?</button><button onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')} className="w-full text-xs text-white/40 mt-3">{mode === 'signup' ? 'Already have an account? Sign in' : 'Have an invitation? Create an account'}</button></>}</Shell>;

  if (needsClaim) return <Shell><ShieldCheck className="w-12 h-12 text-gold mx-auto mb-4" /><h1 className="text-2xl font-serif text-white text-center mb-3">Claim your existing archive</h1><p className="text-white/50 text-sm text-center mb-6">Enter the one-time archive claim code.</p><form onSubmit={claimArchive} className="space-y-4"><input required value={claimCode} onChange={e => setClaimCode(e.target.value)} placeholder="Archive claim code" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white font-mono" /><button disabled={working} className="w-full bg-gold text-deep-blue font-bold py-3 rounded-xl">Claim archive</button></form>{message && <p className="text-sm text-white/60 mt-4 text-center">{message}</p>}</Shell>;

  if (betaLocked) return <Shell><ShieldCheck className="w-12 h-12 text-gold mx-auto mb-4" /><h1 className="text-2xl font-serif text-white text-center mb-3">Private beta</h1><p className="text-white/50 text-sm text-center">This account is valid, but its email has not been invited into AstraDream yet.</p><button onClick={handleSignOut} className="w-full mt-6 rounded-xl border border-white/10 py-3 text-sm text-white/60">Sign out</button></Shell>;

  if (panel === 'password') return <Shell><KeyRound className="w-12 h-12 text-gold mx-auto mb-4" /><h1 className="text-2xl font-serif text-white text-center mb-3">Change password</h1><form onSubmit={saveNewPassword} className="space-y-4"><input required minLength={8} type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New password" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white" /><button disabled={working} className="w-full bg-gold text-deep-blue font-bold py-3 rounded-xl">Update password</button></form><button onClick={() => setPanel(null)} className="w-full text-xs text-white/40 mt-5">Back to journal</button></Shell>;

  if (panel === 'feedback') return <Shell><MessageSquare className="w-12 h-12 text-gold mx-auto mb-4" /><h1 className="text-2xl font-serif text-white text-center mb-3">Beta feedback</h1><form onSubmit={submitFeedback} className="space-y-4"><select value={feedbackCategory} onChange={e => setFeedbackCategory(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white"><option value="general">General</option><option value="bug">Bug</option><option value="idea">Idea</option><option value="ai">AI quality</option><option value="image">Dream image</option></select><textarea required value={feedback} onChange={e => setFeedback(e.target.value)} placeholder="What happened, or what would make AstraDream better?" rows={6} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white resize-none" /><button disabled={working} className="w-full bg-gold text-deep-blue font-bold py-3 rounded-xl">Send feedback</button></form>{message && <p className="text-sm text-white/60 mt-4 text-center">{message}</p>}<button onClick={() => { setPanel(null); setMessage(''); }} className="w-full text-xs text-white/40 mt-5">Back to journal</button></Shell>;

  if (panel === 'beta' && status?.is_owner) return <Shell><UserPlus className="w-12 h-12 text-gold mx-auto mb-4" /><h1 className="text-2xl font-serif text-white text-center mb-3">Private beta invites</h1><p className="text-white/50 text-sm text-center mb-5">Admit an email first; that person can then create an account using the exact same email.</p><form onSubmit={submitInvite} className="space-y-3"><input required type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="friend@example.com" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white" /><button disabled={working} className="w-full bg-gold text-deep-blue font-bold py-3 rounded-xl">Add beta tester</button></form>{message && <p className="text-xs text-white/60 mt-4 text-center">{message}</p>}<div className="mt-6 max-h-48 overflow-y-auto space-y-2">{invites.map(invite => <div key={invite.id} className="rounded-xl border border-white/10 p-3"><div className="text-xs text-white/70 break-all">{invite.email}</div><div className="text-[10px] uppercase tracking-widest text-white/30 mt-1">{invite.accepted_at ? 'Joined' : 'Invited'}</div></div>)}</div><button onClick={() => { setPanel(null); setMessage(''); }} className="w-full text-xs text-white/40 mt-5">Back to journal</button></Shell>;

  if (panel === 'account') return <Shell><ShieldCheck className="w-12 h-12 text-gold mx-auto mb-4" /><h1 className="text-2xl font-serif text-white text-center mb-3">Account & data</h1><p className="text-white/50 text-sm text-center mb-6">Deleting your account permanently removes your profile, dreams, AI cache, feedback and private dream images. Export your journal first if you want a copy.</p><form onSubmit={deleteAccount} className="space-y-3"><input value={deleteConfirmation} onChange={e => setDeleteConfirmation(e.target.value)} placeholder="Type DELETE" className="w-full bg-white/5 border border-red-500/20 rounded-xl px-4 py-3 text-white" /><button disabled={working || deleteConfirmation !== 'DELETE'} className="w-full bg-red-500/80 text-white font-bold py-3 rounded-xl disabled:opacity-30">Permanently delete account</button></form>{message && <p className="text-sm text-white/60 mt-4 text-center">{message}</p>}<button onClick={() => { setPanel(null); setMessage(''); }} className="w-full text-xs text-white/40 mt-5">Back to journal</button></Shell>;

  return <>{children}<div className="fixed top-6 right-6 z-[70] flex flex-wrap justify-end gap-2 max-w-[80vw]"><span className="rounded-full border border-gold/20 bg-black/30 px-3 py-2 text-[9px] uppercase tracking-widest text-gold/60 backdrop-blur-md">Private beta</span>{status?.is_owner && <button onClick={async () => { setPanel('beta'); setMessage(''); await loadInvites().catch(error => setMessage(error instanceof Error ? error.message : 'Could not load invitations')); }} className="rounded-full border border-white/10 bg-black/30 px-3 py-2 text-[10px] text-white/40 backdrop-blur-md hover:text-white/70"><UserPlus className="h-3.5 w-3.5" /></button>}<button onClick={() => { setPanel('feedback'); setMessage(''); }} className="rounded-full border border-white/10 bg-black/30 px-3 py-2 text-[10px] text-white/40 backdrop-blur-md hover:text-white/70" title="Beta feedback"><MessageSquare className="h-3.5 w-3.5" /></button><button onClick={() => { setPanel('password'); setMessage(''); }} className="rounded-full border border-white/10 bg-black/30 px-3 py-2 text-[10px] text-white/40 backdrop-blur-md hover:text-white/70" title="Change password"><KeyRound className="h-3.5 w-3.5" /></button><button onClick={() => { setPanel('account'); setMessage(''); }} className="rounded-full border border-white/10 bg-black/30 px-3 py-2 text-[10px] text-white/40 backdrop-blur-md hover:text-white/70" title="Account & data"><ShieldCheck className="h-3.5 w-3.5" /></button><button onClick={handleSignOut} className="rounded-full border border-white/10 bg-black/30 px-3 py-2 text-[10px] text-white/40 backdrop-blur-md hover:text-white/70" title={user.email || 'Sign out'}><LogOut className="h-3.5 w-3.5" /></button></div></>;
}
