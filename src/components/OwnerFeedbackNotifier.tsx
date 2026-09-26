import { useEffect, useMemo, useState } from 'react';
import { MessageSquare, X } from 'lucide-react';

type Feedback = { id: number; category: string; message: string; page?: string | null; created_at: string; email?: string | null };

const LAST_SEEN_KEY = 'astrodreamer:owner-feedback-last-seen';

export default function OwnerFeedbackNotifier() {
  const [owner, setOwner] = useState(false);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const response = await fetch('/api/profile?auth_action=status');
        if (!response.ok) return;
        const status = await response.json();
        if (!alive || !status?.is_owner) return;
        setOwner(true);
      } finally { if (alive) setReady(true); }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!owner) return;
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch('/api/profile?auth_action=feedback-inbox');
        if (!response.ok) return;
        const rows = await response.json();
        if (alive && Array.isArray(rows)) setFeedback(rows);
      } catch { /* keep app quiet if inbox polling fails */ }
    };
    void load();
    const timer = window.setInterval(load, 30000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [owner]);

  const lastSeen = Number(localStorage.getItem(LAST_SEEN_KEY) || 0);
  const unread = useMemo(() => feedback.filter(item => item.id > lastSeen).length, [feedback, lastSeen]);

  function openInbox() {
    setOpen(true);
    const newest = Math.max(0, ...feedback.map(item => item.id));
    if (newest) localStorage.setItem(LAST_SEEN_KEY, String(newest));
  }

  if (!ready || !owner) return null;

  return <>
    <button onClick={openInbox} className="fixed top-20 left-6 z-[70] flex items-center gap-2 rounded-full border border-white/10 bg-black/55 px-3 py-2 text-xs text-white/60 backdrop-blur-md hover:text-white" title="Beta feedback inbox">
      <MessageSquare className="h-4 w-4" />
      {unread > 0 ? <span className="rounded-full bg-gold px-2 py-0.5 font-bold text-deep-blue">{unread} new</span> : <span className="hidden sm:inline">Feedback</span>}
    </button>

    {open && <div className="fixed inset-0 z-[120] overflow-y-auto bg-[#0a0502]/96 p-4 sm:p-8">
      <div className="atmosphere" />
      <div className="relative z-10 mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between"><div><h2 className="font-serif text-2xl text-white">Beta Feedback</h2><p className="text-sm text-white/40">Newest reports from your testers.</p></div><button onClick={() => setOpen(false)} className="rounded-full border border-white/10 p-3 text-white/50"><X className="h-5 w-5" /></button></div>
        <div className="space-y-3">
          {feedback.length === 0 ? <div className="glass rounded-2xl p-8 text-center text-white/35">No feedback yet.</div> : feedback.map(item => <article key={item.id} className="glass rounded-2xl p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="rounded-full border border-gold/20 bg-gold/5 px-2 py-1 text-[10px] uppercase tracking-widest text-gold/70">{item.category}</span><span className="text-xs text-white/35">{item.email || 'Beta tester'}</span></div><time className="text-xs text-white/25">{new Date(item.created_at).toLocaleString()}</time></div>
            <p className="whitespace-pre-wrap text-sm leading-7 text-white/70">{item.message}</p>
            {item.page && <div className="mt-3 text-[10px] uppercase tracking-widest text-white/25">Page {item.page}</div>}
          </article>)}
        </div>
      </div>
    </div>}
  </>;
}
