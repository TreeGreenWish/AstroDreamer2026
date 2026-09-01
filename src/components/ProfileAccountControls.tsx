import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, KeyRound, Loader2, X } from 'lucide-react';
import { updatePassword } from '../lib/authClient';

export function ProfileAccountControls() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [working, setWorking] = useState<'backup' | 'password' | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const locate = () => {
      const button = Array.from(document.querySelectorAll('button')).find(
        element => element.textContent?.trim() === 'Re-align Profile'
      );
      setTarget(button?.parentElement || null);
    };
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  async function downloadBackup() {
    setWorking('backup');
    setMessage('');
    try {
      const response = await fetch('/api/export');
      if (!response.ok) throw new Error('Backup failed');
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const filename = match?.[1] || `astradream-export-${new Date().toISOString().slice(0, 10)}.json`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Backup download failed', error);
      setMessage('Could not download your backup.');
    } finally {
      setWorking(null);
    }
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    setWorking('password');
    setMessage('');
    try {
      await updatePassword(newPassword);
      setNewPassword('');
      setShowPassword(false);
      setMessage('Password updated successfully.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Password update failed');
    } finally {
      setWorking(null);
    }
  }

  if (!target) return null;

  return createPortal(
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
        <button
          type="button"
          onClick={downloadBackup}
          disabled={working === 'backup'}
          className="w-full py-3 rounded-2xl border border-white/10 text-white/50 hover:text-gold hover:border-gold/30 hover:bg-gold/5 transition-all text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {working === 'backup' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Backup journal
        </button>
        <button
          type="button"
          onClick={() => { setShowPassword(true); setMessage(''); }}
          className="w-full py-3 rounded-2xl border border-white/10 text-white/50 hover:text-gold hover:border-gold/30 hover:bg-gold/5 transition-all text-sm font-medium flex items-center justify-center gap-2"
        >
          <KeyRound className="w-4 h-4" />
          Change password
        </button>
      </div>
      {message && <p className="text-xs text-white/50 text-center mt-3">{message}</p>}

      {showPassword && createPortal(
        <div className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-sm flex items-center justify-center p-5">
          <div className="glass rounded-3xl p-7 w-full max-w-sm relative border border-white/10">
            <button type="button" onClick={() => setShowPassword(false)} className="absolute right-5 top-5 text-white/30 hover:text-white" aria-label="Close password dialog">
              <X className="w-5 h-5" />
            </button>
            <KeyRound className="w-9 h-9 text-gold mb-4" />
            <h3 className="text-2xl font-serif text-white mb-2">Change password</h3>
            <p className="text-sm text-white/40 mb-6">Choose a new password for your AstraDream account.</p>
            <form onSubmit={savePassword} className="space-y-4">
              <input
                required
                minLength={8}
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={event => setNewPassword(event.target.value)}
                placeholder="New password"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold/40"
              />
              <button disabled={working === 'password'} className="w-full bg-gold text-deep-blue font-bold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
                {working === 'password' && <Loader2 className="w-4 h-4 animate-spin" />}
                Update password
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}
    </>,
    target
  );
}
