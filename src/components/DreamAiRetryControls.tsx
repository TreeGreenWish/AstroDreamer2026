import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Image as ImageIcon, Loader2, Sparkles } from 'lucide-react';
import type { Dream, UserProfile } from '../types';
import { generateDreamImage, interpretDream } from '../services/geminiService';

type ActionState = 'idle' | 'working' | 'success' | 'quota' | 'error';

function normalizeTime(value?: string) {
  return (value || '').slice(0, 5);
}

function isQuotaMessage(message: string) {
  return /quota|resource_exhausted|rate.?limit|prepayment credits|429/i.test(message);
}

async function readJson(response: Response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `Request failed (${response.status})`);
  }
  return payload;
}

export default function DreamAiRetryControls() {
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [dream, setDream] = useState<Dream | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [interpretState, setInterpretState] = useState<ActionState>('idle');
  const [imageState, setImageState] = useState<ActionState>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      const title = document.querySelector('h2.text-5xl.font-serif.text-white') as HTMLElement | null;
      const nextMount = title?.parentElement || null;
      if (!nextMount) {
        if (!cancelled) {
          setMountNode(null);
          setDream(null);
        }
        return;
      }

      if (!cancelled) setMountNode(nextMount);

      try {
        const [dreamsRes, profileRes] = await Promise.all([
          fetch('/api/dreams', { cache: 'no-store' }),
          fetch('/api/profile', { cache: 'no-store' })
        ]);
        const dreams = await readJson(dreamsRes) as Dream[];
        const profileData = await readJson(profileRes) as UserProfile;
        const titleText = title?.textContent?.trim();
        const matches = dreams.filter(d => d.title === titleText);

        let selected = matches[0] || null;
        if (matches.length > 1) {
          const detailText = nextMount.textContent || '';
          selected = matches.find(d => detailText.includes(normalizeTime(d.time))) || matches[0];
        }

        if (!cancelled) {
          setDream(selected);
          setProfile(profileData);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : 'Could not load AI controls');
          setDream(null);
        }
      }
    };

    const observer = new MutationObserver(() => void sync());
    observer.observe(document.body, { childList: true, subtree: true });
    void sync();

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, []);

  const statusLabel = useMemo(() => {
    if (!dream) return '';
    if (interpretState === 'working') return 'Generating interpretation…';
    if (imageState === 'working') return 'Generating image…';
    if (interpretState === 'quota' || imageState === 'quota') return 'AI quota unavailable — dream is safely saved';
    if (interpretState === 'error' || imageState === 'error') return 'AI retry failed — dream is still safely saved';
    if (dream.image_url && dream.interpretation) return 'AI enrichment complete';
    if (dream.interpretation) return 'Interpretation complete · image pending';
    if (dream.interpretation_error) return 'Interpretation pending';
    return 'AI enrichment pending';
  }, [dream, interpretState, imageState]);

  const refreshDream = async (id: number) => {
    const response = await fetch('/api/dreams', { cache: 'no-store' });
    const dreams = await readJson(response) as Dream[];
    const fresh = dreams.find(d => d.id === id) || null;
    if (fresh) setDream(fresh);
    return fresh;
  };

  const handleInterpret = async () => {
    if (!dream?.id || !profile) return;
    setInterpretState('working');
    setMessage('');

    try {
      const result = await interpretDream(dream, profile);
      if (result?.pending) {
        setInterpretState('quota');
        setMessage(result.error || 'Interpretation is pending until AI quota is available.');
        await refreshDream(dream.id);
        return;
      }

      await refreshDream(dream.id);
      setInterpretState('success');
      setMessage('Interpretation, symbols, and planetary enrichment saved. Reopen this dream to see the refreshed interpretation.');
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Interpretation failed';
      setInterpretState(isQuotaMessage(text) ? 'quota' : 'error');
      setMessage(text);
    }
  };

  const handleImage = async () => {
    if (!dream?.id) return;
    setImageState('working');
    setMessage('');

    try {
      const imageUrl = await generateDreamImage(dream);
      if (!imageUrl) {
        setImageState('quota');
        setMessage('No image was returned. The dream remains saved and you can retry later.');
        return;
      }

      const updated = {
        ...dream,
        image_url: imageUrl,
        image_generated_at: new Date().toISOString(),
        enrichment_status: dream.interpretation ? 'complete' : dream.enrichment_status
      } as Dream;

      const response = await fetch(`/api/dreams/${dream.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      const saved = await readJson(response) as Dream;
      setDream(saved);
      setImageState('success');
      setMessage('Dream image generated and saved. Reopen this dream to see the refreshed image.');
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Image generation failed';
      setImageState(isQuotaMessage(text) ? 'quota' : 'error');
      setMessage(text);
    }
  };

  if (!mountNode || !dream) return null;

  const interpretationLabel = dream.interpretation
    ? 'Retry Interpretation'
    : dream.interpretation_error
      ? 'Retry Interpretation'
      : 'Generate Interpretation';
  const imageLabel = dream.image_url || dream.image_error ? 'Retry Image' : 'Generate Dream Image';

  return createPortal(
    <div className="pt-4 space-y-3" data-dream-ai-controls>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.18em] text-white/30 border border-white/10 rounded-full px-3 py-1.5">
          {statusLabel}
        </span>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleInterpret}
          disabled={interpretState === 'working' || imageState === 'working'}
          className="flex items-center gap-2 bg-gold/15 border border-gold/30 text-gold hover:bg-gold/25 disabled:opacity-40 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all"
        >
          {interpretState === 'working' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {interpretState === 'working' ? 'Interpreting…' : interpretationLabel}
        </button>

        <button
          type="button"
          onClick={handleImage}
          disabled={imageState === 'working' || interpretState === 'working'}
          className="flex items-center gap-2 bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-40 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all"
        >
          {imageState === 'working' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
          {imageState === 'working' ? 'Generating…' : imageLabel}
        </button>
      </div>

      {message && (
        <p className="text-xs text-white/40 leading-relaxed max-w-2xl">
          {message}
        </p>
      )}
    </div>,
    mountNode
  );
}
