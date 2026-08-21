import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Image as ImageIcon, Loader2, Sparkles } from 'lucide-react';
import type { Dream, UserProfile } from '../types';
import { generateDreamImage, interpretDream } from '../services/geminiService';

type ActionState = 'idle' | 'working' | 'pending' | 'success' | 'quota' | 'error';

function normalizeTime(value?: string) {
  return (value || '').slice(0, 5);
}

function isQuotaMessage(message: string) {
  return /quota|resource_exhausted|rate.?limit|prepayment credits|429/i.test(message);
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
    if (interpretState === 'pending') return 'Interpretation is still processing';
    if (imageState === 'pending') return 'Image generation is still processing';
    if (interpretState === 'quota' || imageState === 'quota') return 'AI quota unavailable — dream is safely saved';
    if (interpretState === 'error' || imageState === 'error') return 'AI retry failed — dream is still safely saved';
    if (dream.image_url && dream.interpretation) return 'AI enrichment complete';
    if (dream.interpretation) return 'Interpretation complete · image pending';
    if (dream.enrichment_status === 'interpreting') return 'Interpretation is still processing';
    if (dream.interpretation_error && isQuotaMessage(dream.interpretation_error)) return 'Interpretation pending · quota unavailable';
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

  const persistDream = async (updated: Dream) => {
    if (!updated.id) throw new Error('Dream id is missing');
    const response = await fetch(`/api/dreams/${updated.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    });
    const saved = await readJson(response) as Dream;
    setDream(saved);
    return saved;
  };

  const pollDream = async (
    id: number,
    isComplete: (fresh: Dream) => boolean,
    attempts = 6,
    intervalMs = 1500
  ) => {
    let latest: Dream | null = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt > 0) await sleep(intervalMs);
      latest = await refreshDream(id);
      if (latest && isComplete(latest)) return latest;
    }
    return latest;
  };

  const revealPersistedResult = () => {
    window.setTimeout(() => window.location.reload(), 350);
  };

  const handleInterpret = async () => {
    if (!dream?.id || !profile) return;
    const id = dream.id;
    setInterpretState('working');
    setMessage('');

    let workingDream = dream;
    try {
      // Clear stale errors so yesterday's quota state is never shown during a new attempt.
      workingDream = await persistDream({
        ...dream,
        interpretation_error: undefined,
        enrichment_status: dream.interpretation ? dream.enrichment_status : 'interpreting'
      } as Dream);

      const result = await interpretDream(workingDream, profile);
      const fresh = await pollDream(id, d => Boolean(d.interpretation));

      if (fresh?.interpretation) {
        setInterpretState('success');
        setMessage('Interpretation, symbols, and planetary enrichment are saved. Refreshing the dream…');
        revealPersistedResult();
        return;
      }

      if (result?.pending) {
        const savedError = fresh?.interpretation_error || result?.error || '';
        if (isQuotaMessage(savedError)) {
          setInterpretState('quota');
          setMessage('Gemini reported a quota or billing limit. Your dream is safely saved and can be retried later.');
        } else {
          setInterpretState('pending');
          setMessage('The interpretation request was accepted and is still processing. AstraDream will keep checking the saved dream state.');
        }
        return;
      }

      setInterpretState('pending');
      setMessage('The interpretation request finished without a final saved result yet. The dream is safe; retry if it does not appear shortly.');
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Interpretation failed';

      // A slow client response can race with a successful server-side save. Check persisted state before calling it a failure.
      try {
        const fresh = await pollDream(id, d => Boolean(d.interpretation), 4, 1000);
        if (fresh?.interpretation) {
          setInterpretState('success');
          setMessage('Interpretation completed and was saved successfully. Refreshing the dream…');
          revealPersistedResult();
          return;
        }

        const savedError = fresh?.interpretation_error || text;
        if (isQuotaMessage(savedError)) {
          setInterpretState('quota');
          setMessage('Gemini reported a quota or billing limit. Your dream is safely saved and can be retried later.');
          return;
        }
      } catch {
        // Preserve the original request error if the status refresh also fails.
      }

      setInterpretState('error');
      setMessage(text);
    }
  };

  const handleImage = async () => {
    if (!dream?.id) return;
    const id = dream.id;
    setImageState('working');
    setMessage('');

    let workingDream = dream;
    try {
      // Clear stale image errors before a new attempt.
      workingDream = await persistDream({ ...dream, image_error: undefined } as Dream);
      const imageUrl = await generateDreamImage(workingDream);

      if (imageUrl) {
        const updated = {
          ...workingDream,
          image_url: imageUrl,
          image_generated_at: new Date().toISOString(),
          image_error: undefined,
          enrichment_status: workingDream.interpretation ? 'complete' : workingDream.enrichment_status
        } as Dream;

        await persistDream(updated);
        const fresh = await pollDream(id, d => Boolean(d.image_url), 4, 1000);
        if (fresh?.image_url) {
          setImageState('success');
          setMessage('Dream image generated and saved. Refreshing the dream…');
          revealPersistedResult();
          return;
        }
      }

      const fresh = await pollDream(id, d => Boolean(d.image_url), 6, 1500);
      if (fresh?.image_url) {
        setImageState('success');
        setMessage('Dream image generated and saved. Refreshing the dream…');
        revealPersistedResult();
        return;
      }

      const savedError = fresh?.image_error || '';
      if (isQuotaMessage(savedError)) {
        setImageState('quota');
        setMessage('Gemini reported a quota or billing limit. Your dream is safely saved and you can retry the image later.');
      } else {
        setImageState('pending');
        setMessage('The image request was accepted but no final image is saved yet. AstraDream will show it as soon as the saved dream updates.');
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Image generation failed';

      try {
        const fresh = await pollDream(id, d => Boolean(d.image_url), 4, 1000);
        if (fresh?.image_url) {
          setImageState('success');
          setMessage('Dream image generated and saved. Refreshing the dream…');
          revealPersistedResult();
          return;
        }

        const savedError = fresh?.image_error || text;
        if (isQuotaMessage(savedError)) {
          setImageState('quota');
          setMessage('Gemini reported a quota or billing limit. Your dream is safely saved and you can retry the image later.');
          return;
        }
      } catch {
        // Preserve the original request error if the status refresh also fails.
      }

      setImageState('error');
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
