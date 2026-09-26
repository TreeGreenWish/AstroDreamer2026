import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, ChevronDown, ChevronUp, Loader2, Moon, Orbit, Sparkles } from 'lucide-react';
import type { Dream } from '../types';

type Evidence = { kind:string; label:string; detail:string; score:number; orb?:number };
type Resonance = { dreamId:number; score:number; strength:'very_strong'|'strong'|'moderate'; evidence:Evidence[]; whyToday:string; interpretation?:string|null };
type Payload = { date:string; day_number:number; moon_phase?:string; source:string; resonances:Resonance[] };

function localParts() {
  const d = new Date();
  return {
    date: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
    time: `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  };
}

function strengthLabel(value: Resonance['strength']) {
  return value === 'very_strong' ? 'Very strong resonance' : value === 'strong' ? 'Strong resonance' : 'Meaningful resonance';
}

export default function TemporalResonanceFeed() {
  const [host,setHost] = useState<HTMLElement|null>(null);
  const [active,setActive] = useState(false);
  const [payload,setPayload] = useState<Payload|null>(null);
  const [dreams,setDreams] = useState<Dream[]>([]);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState('');
  const [expanded,setExpanded] = useState<Record<number,boolean>>({});

  useEffect(()=>{
    const locate = () => {
      const navs = Array.from(document.querySelectorAll('nav')) as HTMLElement[];
      const primary = navs.find(n=>n.querySelectorAll('button').length>=5) || null;
      const feedActive = Boolean(primary && Array.from(primary.querySelectorAll('button')).some(b=>b.textContent?.trim()==='Feed'));
      setActive(feedActive);
      if (!feedActive) { setHost(null); return; }
      const heading = Array.from(document.querySelectorAll('h2')).find(h=>h.textContent?.trim()==='Cosmic Echoes');
      const root = heading?.parentElement?.parentElement as HTMLElement|null;
      if (!root) { setHost(null); return; }
      let slot = root.querySelector('[data-temporal-resonance-slot]') as HTMLElement|null;
      if (!slot) {
        slot = document.createElement('div');
        slot.dataset.temporalResonanceSlot='true';
        const header = heading?.parentElement;
        if (header?.nextSibling) root.insertBefore(slot,header.nextSibling); else root.appendChild(slot);
      }
      setHost(slot);

      // Retire the original broad same-sign sections now that exact temporal resonance exists.
      Array.from(root.querySelectorAll('h3')).forEach(h=>{
        const text = h.textContent?.trim() || '';
        const old = text === 'Planetary Alignments' || text === 'On This Day...' || text.startsWith('Sun in ') || text.startsWith('Moon in ');
        if (old) {
          const section = h.parentElement?.parentElement as HTMLElement|null;
          if (section && !section.dataset.temporalHidden) { section.dataset.temporalHidden='true'; section.style.display='none'; }
        }
      });
    };
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body,{childList:true,subtree:true,characterData:true});
    return ()=>observer.disconnect();
  },[]);

  useEffect(()=>{
    if (!active || payload || loading) return;
    (async()=>{
      try {
        setLoading(true); setError('');
        const now = localParts();
        const qs = new URLSearchParams(now);
        const [r,d] = await Promise.all([fetch(`/api/temporal-resonance?${qs}`),fetch('/api/dreams')]);
        const rp = await r.json().catch(()=>({}));
        const dp = await d.json().catch(()=>[]);
        if (!r.ok) throw new Error(rp?.error || `Resonance request failed (${r.status})`);
        setPayload(rp); setDreams(Array.isArray(dp)?dp:[]);
      } catch(e) { setError(e instanceof Error?e.message:'Could not calculate temporal resonance'); }
      finally { setLoading(false); }
    })();
  },[active,payload,loading]);

  const dreamMap = useMemo(()=>new Map(dreams.map(d=>[d.id,d])),[dreams]);

  function openDream(dream: Dream) {
    const candidates = Array.from(document.querySelectorAll('.cursor-pointer')) as HTMLElement[];
    const match = candidates.find(el=>el.textContent?.includes(dream.title));
    if (match) match.click();
  }

  if (!active || !host) return null;

  return createPortal(
    <section className="space-y-6 my-10">
      <div className="flex items-center gap-3 border-b border-white/5 pb-4">
        <div className="p-2 bg-gold/10 rounded-lg text-gold"><Orbit className="w-4 h-4" /></div>
        <div className="flex-1"><h3 className="text-xs uppercase tracking-[0.3em] text-white/60 font-bold">Resonating Today</h3><p className="mt-1 text-xs text-white/30">Past dreams selected because today's astrology or numerology echoes the conditions in which they were recorded.</p></div>
      </div>

      {loading && <div className="glass rounded-3xl p-8 flex items-center justify-center gap-3 text-white/40"><Loader2 className="w-5 h-5 animate-spin text-gold" /> Calculating today's strongest echoes…</div>}
      {error && <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-200/80">{error}</div>}

      {!loading && payload && payload.resonances.length===0 && <div className="glass rounded-3xl p-7 text-center"><Moon className="w-7 h-7 mx-auto mb-3 text-white/20" /><h4 className="font-serif text-lg text-white/60">No strong temporal resonance today</h4><p className="mt-2 text-sm text-white/30">AstroDreamer found no past dream above the evidence threshold. It won't manufacture a connection just to fill the feed.</p></div>}

      <div className="grid gap-5">
        {payload?.resonances.map(r=>{
          const dream = dreamMap.get(r.dreamId); if (!dream) return null;
          const isOpen = Boolean(expanded[r.dreamId]);
          return <article key={r.dreamId} className="glass overflow-hidden rounded-3xl border border-gold/15">
            <div className="grid md:grid-cols-[180px_1fr]">
              {dream.image_url && <button onClick={()=>openDream(dream)} className="h-44 md:h-full overflow-hidden"><img src={dream.image_url} alt="" className="h-full w-full object-cover opacity-75 hover:opacity-100 transition-opacity" /></button>}
              <div className="p-6 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-[10px] uppercase tracking-[0.24em] text-gold">{strengthLabel(r.strength)}</div><button onClick={()=>openDream(dream)} className="mt-1 text-left font-serif text-2xl text-white hover:text-gold">{dream.title}</button><div className="mt-1 text-xs text-white/25">Recorded {dream.date}</div></div><div className="rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-widest text-white/35">Resonance {r.score}</div></div>
                <div><div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-widest text-gold/70"><Sparkles className="w-3 h-3" /> Why today</div><p className="text-sm leading-7 text-white/65">{r.whyToday}</p></div>
                {r.interpretation && <p className="border-l border-gold/20 pl-4 text-sm italic leading-7 text-white/45">{r.interpretation}</p>}
                <button onClick={()=>setExpanded(v=>({...v,[r.dreamId]:!isOpen}))} className="flex items-center gap-2 text-xs text-white/40 hover:text-white">{isOpen?<ChevronUp className="w-4 h-4"/>:<ChevronDown className="w-4 h-4"/>} Why am I seeing this?</button>
                {isOpen && <div className="space-y-2 rounded-2xl border border-white/10 bg-black/20 p-4">{r.evidence.map((e,i)=><div key={`${e.label}-${i}`} className="flex gap-3"><Activity className="mt-0.5 w-3.5 h-3.5 shrink-0 text-gold/50"/><div><div className="text-xs font-medium text-white/65">{e.label}{typeof e.orb==='number'?` · ${e.orb.toFixed(1)}° orb`:''}</div><div className="mt-0.5 text-xs leading-5 text-white/35">{e.detail}</div></div></div>)}<p className="pt-2 text-[10px] leading-5 text-white/25">Astrological relationships are calculated deterministically from stored planetary positions. The reflective interpretation is secondary and does not create or alter the underlying match.</p></div>}
                <button onClick={()=>openDream(dream)} className="rounded-full bg-gold/10 px-5 py-2 text-xs font-bold uppercase tracking-widest text-gold hover:bg-gold/20">Revisit dream</button>
              </div>
            </div>
          </article>;
        })}
      </div>
      {payload && <div className="text-center text-[10px] text-white/20">Today: Day {payload.day_number} · {payload.moon_phase || 'lunar phase unavailable'} · deterministic astronomy</div>}
    </section>,host);
}
