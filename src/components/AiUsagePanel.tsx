import { useState } from 'react';
import { CircleDollarSign, Loader2, X } from 'lucide-react';

type OperationUsage = {
  operation: string;
  requests: number;
  provider_calls: number;
  cache_hits: number;
  failures: number;
  images: number;
  estimated_cost_usd: number;
};

type UsageSummary = {
  month: string;
  requests: number;
  provider_calls: number;
  cache_hits: number;
  failures: number;
  images: number;
  estimated_cost_usd: number;
  avg_provider_latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  limits: { monthly_budget_usd?: number | string | null; daily_request_limit?: number | null; monthly_image_limit?: number | null; enabled?: boolean } | null;
  by_operation: OperationUsage[];
};

function label(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function dollars(value: number) {
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

export function AiUsagePanel() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [error, setError] = useState('');

  async function showUsage() {
    setOpen(true);
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/profile?auth_action=ai-usage');
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || `Usage request failed (${response.status})`);
      setSummary(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load AI usage');
    } finally {
      setLoading(false);
    }
  }

  return <>
    <button onClick={showUsage} className="fixed bottom-6 right-6 z-[65] flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-2 text-[10px] uppercase tracking-widest text-white/50 backdrop-blur-md hover:text-white/80" title="AI usage and estimated cost">
      <CircleDollarSign className="h-3.5 w-3.5" /> AI Usage
    </button>
    {open && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="glass relative max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-3xl p-6 md:p-8">
        <button onClick={() => setOpen(false)} className="absolute right-5 top-5 text-white/40 hover:text-white"><X className="h-5 w-5" /></button>
        <div className="mb-6 flex items-center gap-3"><CircleDollarSign className="h-8 w-8 text-gold" /><div><h2 className="font-serif text-2xl text-white">AI Usage</h2><p className="text-xs text-white/40">Estimated provider spend for this account</p></div></div>
        {loading && <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-orange-500" /></div>}
        {error && <p className="rounded-xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">{error}</p>}
        {!loading && summary && <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="text-[10px] uppercase tracking-widest text-white/35">This month</div><div className="mt-1 text-2xl font-semibold text-gold">{dollars(summary.estimated_cost_usd)}</div></div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="text-[10px] uppercase tracking-widest text-white/35">Provider calls</div><div className="mt-1 text-2xl font-semibold text-white">{summary.provider_calls}</div></div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="text-[10px] uppercase tracking-widest text-white/35">Images</div><div className="mt-1 text-2xl font-semibold text-white">{summary.images}</div></div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="text-[10px] uppercase tracking-widest text-white/35">Cache hits</div><div className="mt-1 text-2xl font-semibold text-white">{summary.cache_hits}</div></div>
          </div>
          {summary.limits && <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs text-white/50">
            Safety limits: {summary.limits.monthly_budget_usd != null ? `$${Number(summary.limits.monthly_budget_usd).toFixed(2)}/month` : 'no monthly budget'} · {summary.limits.daily_request_limit ?? '∞'} calls/day · {summary.limits.monthly_image_limit ?? '∞'} images/month
          </div>}
          <div className="mt-6">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-white/40">By operation</h3>
            <div className="space-y-2">
              {summary.by_operation.length ? summary.by_operation.map(row => <div key={row.operation} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <div><div className="text-sm text-white/80">{label(row.operation)}</div><div className="mt-0.5 text-[11px] text-white/35">{row.provider_calls} provider · {row.cache_hits} cached{row.failures ? ` · ${row.failures} failed` : ''}{row.images ? ` · ${row.images} images` : ''}</div></div>
                <div className="font-mono text-sm text-gold">{dollars(row.estimated_cost_usd)}</div>
              </div>) : <p className="py-6 text-center text-sm text-white/35">No metered AI calls yet. Your next AI action will appear here.</p>}
            </div>
          </div>
          <p className="mt-5 text-[11px] leading-relaxed text-white/30">Costs are estimates based on AstraDream's current Google Gemini price table. Text-token counts are currently estimated from payload size unless provider usage metadata is available; image pricing uses the published 1K per-image rate.</p>
        </>}
      </div>
    </div>}
  </>;
}
