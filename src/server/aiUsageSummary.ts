const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "") || "https://wgtagrrvnieuzheggsis.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function headers() {
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" };
}

async function rest<T>(path: string): Promise<T> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers: headers() });
  if (!response.ok) throw new Error(`AI usage summary failed (${response.status}): ${await response.text()}`);
  return JSON.parse(await response.text() || "null") as T;
}

export async function getAiUsageSummary(userId: string) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const encodedUser = encodeURIComponent(userId);
  const [events, limits] = await Promise.all([
    rest<Array<{
      operation: string; model: string; success: boolean; cache_hit: boolean; image_count: number;
      estimated_cost_usd: number | string | null; latency_ms: number | null; input_tokens: number | null;
      output_tokens: number | null; thinking_tokens: number | null; total_tokens: number | null; created_at: string;
    }>>(`ai_usage_events?user_id=eq.${encodedUser}&created_at=gte.${encodeURIComponent(monthStart)}&select=operation,model,success,cache_hit,image_count,estimated_cost_usd,latency_ms,input_tokens,output_tokens,thinking_tokens,total_tokens,created_at&order=created_at.desc&limit=1000`),
    rest<Array<{ monthly_budget_usd: number | string | null; daily_request_limit: number | null; monthly_image_limit: number | null; enabled: boolean }>>(`ai_usage_limits?user_id=eq.${encodedUser}&select=monthly_budget_usd,daily_request_limit,monthly_image_limit,enabled&limit=1`),
  ]);

  const byOperation = new Map<string, { requests: number; provider_calls: number; cache_hits: number; failures: number; images: number; estimated_cost_usd: number }>();
  let totalCost = 0;
  let images = 0;
  let failures = 0;
  let cacheHits = 0;
  let providerCalls = 0;
  let latencyTotal = 0;
  let latencyCount = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let thinkingTokens = 0;

  for (const event of events) {
    const cost = Number(event.estimated_cost_usd || 0);
    totalCost += cost;
    images += Number(event.image_count || 0);
    if (!event.success) failures += 1;
    if (event.cache_hit) cacheHits += 1; else providerCalls += 1;
    if (event.latency_ms != null && !event.cache_hit) { latencyTotal += event.latency_ms; latencyCount += 1; }
    inputTokens += Number(event.input_tokens || 0);
    outputTokens += Number(event.output_tokens || 0);
    thinkingTokens += Number(event.thinking_tokens || 0);
    const row = byOperation.get(event.operation) || { requests: 0, provider_calls: 0, cache_hits: 0, failures: 0, images: 0, estimated_cost_usd: 0 };
    row.requests += 1;
    if (event.cache_hit) row.cache_hits += 1; else row.provider_calls += 1;
    if (!event.success) row.failures += 1;
    row.images += Number(event.image_count || 0);
    row.estimated_cost_usd += cost;
    byOperation.set(event.operation, row);
  }

  return {
    month: monthStart.slice(0, 7),
    requests: events.length,
    provider_calls: providerCalls,
    cache_hits: cacheHits,
    failures,
    images,
    estimated_cost_usd: Number(totalCost.toFixed(6)),
    avg_provider_latency_ms: latencyCount ? Math.round(latencyTotal / latencyCount) : 0,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    thinking_tokens: thinkingTokens,
    limits: limits[0] || null,
    by_operation: [...byOperation.entries()].map(([operation, value]) => ({
      operation,
      ...value,
      estimated_cost_usd: Number(value.estimated_cost_usd.toFixed(6)),
    })).sort((a, b) => b.estimated_cost_usd - a.estimated_cost_usd),
    recent: events.slice(0, 20),
  };
}
