import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronLeft, Loader2, Plus, Sparkles, Trash2, X } from 'lucide-react';

type CreativeStatus = 'seed' | 'draft' | 'developing' | 'finished';
type CreativeEntry = {
  id?: number;
  title: string;
  body: string;
  tags: string[];
  status: CreativeStatus;
  source_prompt?: string | null;
  source_dream_id?: number | null;
  created_at?: string;
  updated_at?: string;
};

type PromptSeed = { prompt: string; dreamId?: number | null; type?: string };

const emptyEntry = (): CreativeEntry => ({ title: '', body: '', tags: [], status: 'draft' });

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || `Request failed (${response.status})`);
  return payload as T;
}

function readLatestPrompt(): PromptSeed | null {
  try {
    const raw = localStorage.getItem('astradream:latest-creative-prompt');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export default function CreativeJournalPortal() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<CreativeEntry[]>([]);
  const [selected, setSelected] = useState<CreativeEntry | null>(null);
  const [working, setWorking] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved'>('idle');
  const [latestPrompt, setLatestPrompt] = useState<PromptSeed | null>(() => readLatestPrompt());
  const [error, setError] = useState('');
  const dirtyRef = useRef(false);

  useEffect(() => {
    const promptHandler = () => setLatestPrompt(readLatestPrompt());
    const openHandler = () => setOpen(true);
    window.addEventListener('astradream:creative-prompt', promptHandler);
    window.addEventListener('astradream:open-creative', openHandler);
    return () => {
      window.removeEventListener('astradream:creative-prompt', promptHandler);
      window.removeEventListener('astradream:open-creative', openHandler);
    };
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('astradream:creative-open-state', { detail: { open } }));
    if (!open) return;
    void loadEntries();
  }, [open]);

  useEffect(() => {
    if (!selected?.id || !dirtyRef.current) return;
    const timer = window.setTimeout(async () => {
      try {
        setSaveState('saving');
        const saved = await api<CreativeEntry>('/api/creative', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...selected, id: selected.id }),
        });
        dirtyRef.current = false;
        setSelected(saved);
        setEntries(prev => prev.map(e => e.id === saved.id ? saved : e));
        setSaveState('saved');
        setError('');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Autosave failed');
        setSaveState('dirty');
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [selected?.title, selected?.body, JSON.stringify(selected?.tags), selected?.status, selected?.id]);

  async function loadEntries() {
    try {
      setWorking(true); setError('');
      const rows = await api<CreativeEntry[]>('/api/creative');
      setEntries(rows);
      if (selected?.id) setSelected(rows.find(e => e.id === selected.id) || null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load creative journal'); }
    finally { setWorking(false); }
  }

  function mutate(patch: Partial<CreativeEntry>) {
    if (!selected) return;
    dirtyRef.current = true;
    setSaveState('dirty');
    setSelected({ ...selected, ...patch });
  }

  async function createEntry(seed?: PromptSeed) {
    try {
      setWorking(true); setError('');
      const entry = await api<CreativeEntry>('/api/creative', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...emptyEntry(),
          status: seed ? 'seed' : 'draft',
          title: seed ? 'Creative exercise' : 'Untitled piece',
          source_prompt: seed?.prompt || null,
          source_dream_id: seed?.dreamId || null,
        }),
      });
      setEntries(prev => [entry, ...prev]);
      setSelected(entry);
      setSaveState('saved');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create entry'); }
    finally { setWorking(false); }
  }

  async function removeSelected() {
    if (!selected?.id || !confirm('Delete this creative entry?')) return;
    try {
      await api('/api/creative', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: selected.id }) });
      setEntries(prev => prev.filter(e => e.id !== selected.id));
      setSelected(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not delete entry'); }
  }

  const revisit = useMemo(() => entries.filter(e => e.status !== 'finished').slice().sort((a,b) => new Date(a.updated_at || 0).getTime() - new Date(b.updated_at || 0).getTime())[0], [entries]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-[#0a0502]/98 overflow-y-auto">
      <div className="atmosphere" />
      <div className="relative z-10 mx-auto min-h-screen max-w-5xl p-4 sm:p-8 pb-28">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3"><BookOpen className="h-6 w-6 text-gold" /><div><h2 className="font-serif text-2xl text-white">Creative Journal</h2><p className="text-xs text-white/40">Seeds, drafts, revisions, finished work.</p></div></div>
          <button onClick={() => setOpen(false)} className="rounded-full border border-white/10 p-3 text-white/50 hover:text-white"><X className="h-5 w-5" /></button>
        </header>

        {error && <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-200">{error}</div>}

        {selected ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button onClick={() => setSelected(null)} className="flex items-center gap-2 text-sm text-white/50 hover:text-white"><ChevronLeft className="h-4 w-4" /> All writing</button>
              <div className="flex items-center gap-3 text-xs text-white/35"><span>{saveState === 'saving' ? 'Saving…' : saveState === 'dirty' ? 'Unsaved changes' : 'Saved'}</span><button onClick={removeSelected} className="rounded-lg border border-red-500/20 p-2 text-red-300/70"><Trash2 className="h-4 w-4" /></button></div>
            </div>

            {selected.source_prompt && <div className="glass rounded-2xl p-4"><div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-widest text-gold/60"><Sparkles className="h-3.5 w-3.5" /> Source exercise</div><p className="font-serif text-sm leading-relaxed text-white/65">{selected.source_prompt}</p></div>}

            <input value={selected.title} onChange={e => mutate({ title: e.target.value })} className="w-full bg-transparent font-serif text-3xl text-white outline-none placeholder:text-white/20" placeholder="Untitled piece" />
            <div className="flex flex-wrap gap-3">
              <select value={selected.status} onChange={e => mutate({ status: e.target.value as CreativeStatus })} className="rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-white/70"><option value="seed">Seed</option><option value="draft">Draft</option><option value="developing">Developing</option><option value="finished">Finished</option></select>
              <input value={(selected.tags || []).join(', ')} onChange={e => mutate({ tags: e.target.value.split(',').map(v => v.trim()).filter(Boolean) })} className="min-w-[240px] flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" placeholder="tags, separated, by commas" />
            </div>
            <textarea value={selected.body} onChange={e => mutate({ body: e.target.value, status: selected.status === 'seed' && e.target.value.trim() ? 'draft' : selected.status })} className="min-h-[55vh] w-full resize-y rounded-2xl border border-white/10 bg-white/[0.03] p-5 font-serif text-base leading-8 text-white/85 outline-none focus:border-gold/30" placeholder="Begin writing…" />
            <p className="text-xs text-white/25">AstraDream keeps meaningful snapshots while you revise, so ongoing work can evolve without losing its history.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <button onClick={() => createEntry()} className="glass rounded-2xl p-5 text-left hover:border-gold/30"><Plus className="mb-3 h-5 w-5 text-gold" /><h3 className="font-serif text-lg text-white">New creative entry</h3><p className="mt-1 text-sm text-white/40">Start a poem, scene, fragment, essay, lyric, or anything else.</p></button>
              {latestPrompt && <button onClick={() => createEntry(latestPrompt)} className="glass rounded-2xl p-5 text-left hover:border-gold/30"><Sparkles className="mb-3 h-5 w-5 text-gold" /><h3 className="font-serif text-lg text-white">Save latest feed exercise</h3><p className="mt-1 line-clamp-3 text-sm text-white/40">{latestPrompt.prompt}</p></button>}
            </div>

            {revisit && <button onClick={() => setSelected(revisit)} className="w-full rounded-2xl border border-gold/15 bg-gold/[0.04] p-5 text-left"><div className="mb-1 text-[10px] uppercase tracking-widest text-gold/60">Continue a thread</div><div className="font-serif text-xl text-white">{revisit.title || 'Untitled piece'}</div><div className="mt-2 text-sm text-white/40">Return to something unfinished that has been waiting for you.</div></button>}

            <div>
              <div className="mb-3 flex items-center justify-between"><h3 className="text-xs font-bold uppercase tracking-widest text-white/40">Your writing</h3><span className="text-xs text-white/25">{entries.length} entries</span></div>
              {working && entries.length === 0 ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div> : entries.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-white/30">Your creative journal is empty. Start with your own idea or save an exercise from the feed.</div> : <div className="grid gap-3 sm:grid-cols-2">{entries.map(entry => <button key={entry.id} onClick={() => setSelected(entry)} className="glass rounded-2xl p-4 text-left hover:border-white/20"><div className="mb-2 flex items-center justify-between gap-3"><span className="font-serif text-lg text-white">{entry.title || 'Untitled piece'}</span><span className="rounded-full border border-white/10 px-2 py-1 text-[9px] uppercase tracking-widest text-white/35">{entry.status}</span></div><p className="line-clamp-3 text-sm leading-relaxed text-white/40">{entry.body || entry.source_prompt || 'Empty entry'}</p>{entry.tags?.length > 0 && <div className="mt-3 flex flex-wrap gap-1">{entry.tags.slice(0,5).map(tag => <span key={tag} className="rounded-full bg-white/5 px-2 py-1 text-[10px] text-white/35">#{tag}</span>)}</div>}</button>)}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
