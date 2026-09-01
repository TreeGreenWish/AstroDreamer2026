import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Sparkles } from 'lucide-react';

type Placement = { key: string; label: string; meaning: string; reflection: string };
type Guidance = {
  baseline: { placements?: Placement[]; synthesis?: string };
  daily: { headline?: string; horoscope?: string; numerology?: string; focus?: string; day_number?: number; moon_phase?: string };
  date: string;
};

function todayLocal() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function ProfileAstrologyGuide() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [active, setActive] = useState(false);
  const [data, setData] = useState<Guidance | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const locate = () => {
      const navs = Array.from(document.querySelectorAll('nav')) as HTMLElement[];
      const primary = navs.find(n => n.querySelectorAll('button').length >= 5) || null;
      const profileActive = Boolean(primary && Array.from(primary.querySelectorAll('button')).some(b => b.textContent?.trim() === 'Profile'));
      setActive(profileActive);
      setHost(profileActive ? document.querySelector('main') as HTMLElement | null : null);
    };
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!active || data || loading) return;
    (async () => {
      try {
        setLoading(true); setError('');
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        const response = await fetch(`/api/profile-astrology?date=${encodeURIComponent(todayLocal())}&timezone=${encodeURIComponent(timezone)}`);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || `Request failed (${response.status})`);
        setData(payload);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load astrology guide');
      } finally { setLoading(false); }
    })();
  }, [active, data, loading]);

  const selectedPlacement = useMemo(() => data?.baseline?.placements?.find(p => p.key === selected) || null, [data, selected]);

  if (!active || !host) return null;

  return createPortal(
    <section className="mt-8 mb-24 space-y-6">
      <div className="glass rounded-3xl p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2 text-gold"><Sparkles className="h-5 w-5" /><h3 className="font-serif text-xl text-white">Daily Alignment</h3></div>
        {loading && <div className="flex items-center gap-2 py-5 text-sm text-white/40"><Loader2 className="h-4 w-4 animate-spin" /> Reading today's sky…</div>}
        {error && <p className="text-sm text-red-200/80">{error}</p>}
        {data?.daily && <div className="space-y-4">
          <div><div className="font-serif text-2xl text-white">{data.daily.headline}</div><div className="mt-1 text-xs uppercase tracking-widest text-white/30">Day {data.daily.day_number ?? '—'} · {data.daily.moon_phase || 'Current lunar cycle'}</div></div>
          <p className="text-sm leading-7 text-white/65">{data.daily.horoscope}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="mb-1 text-[10px] uppercase tracking-widest text-gold/60">Numerology</div><p className="text-sm leading-6 text-white/55">{data.daily.numerology}</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="mb-1 text-[10px] uppercase tracking-widest text-gold/60">Today's focus</div><p className="text-sm leading-6 text-white/55">{data.daily.focus}</p></div>
          </div>
        </div>}
      </div>

      {data?.baseline && <div className="glass rounded-3xl p-5 sm:p-6">
        <h3 className="font-serif text-xl text-white">Your Alignments</h3>
        <p className="mt-1 text-sm text-white/40">Tap a placement for its cached baseline meaning. These are stable reference notes, not daily predictions.</p>
        {data.baseline.synthesis && <p className="mt-4 text-sm leading-7 text-white/60">{data.baseline.synthesis}</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          {(data.baseline.placements || []).map(p => <button key={p.key} onClick={() => setSelected(selected === p.key ? null : p.key)} className={selected === p.key ? 'rounded-full border border-gold/40 bg-gold/10 px-3 py-2 text-xs text-gold' : 'rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/50 hover:text-white'}>{p.label}</button>)}
        </div>
        {selectedPlacement && <div className="mt-5 rounded-2xl border border-gold/15 bg-gold/[0.04] p-5">
          <div className="font-serif text-xl text-white">{selectedPlacement.label}</div>
          <p className="mt-2 text-sm leading-7 text-white/65">{selectedPlacement.meaning}</p>
          <div className="mt-4 text-[10px] uppercase tracking-widest text-gold/60">Reflection</div>
          <p className="mt-1 text-sm italic text-white/50">{selectedPlacement.reflection}</p>
        </div>}
      </div>}
    </section>,
    host,
  );
}
