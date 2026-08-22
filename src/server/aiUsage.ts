const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "") || "https://wgtagrrvnieuzheggsis.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export type AiOperation = "profile_analysis" | "dream_interpretation" | "dream_revisit" | "dream_image" | "insights" | "creative_prompt" | "current_astrology" | "month_astrology";

type UsageMetadata = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
  promptTokensDetails?: Array<{ modality?: string; tokenCount?: number }>;
  candidatesTokensDetails?: Array<{ modality?: string; tokenCount?: number }>;
};

type MeterOptions<T> = {
  userId: string;
  operation: AiOperation;
  model: string;
  execute: () => Promise<T>;
  getUsage?: (result: T) => UsageMetadata | undefined;
  imageCount?: (result: T) => number;
  metadata?: Record<string, unknown>;
};

const MODEL_PRICING: Record<string, { inputPerMillion: number; outputPerMillion: number; image1k?: number }> = {
  "gemini-3-flash-preview": { inputPerMillion: 0.50, outputPerMillion: 3.00 },
  "gemini-3.1-flash-lite-image": { inputPerMillion: 0.25, outputPerMillion: 1.50, image1k: 0.0336 },
};

function serviceHeaders(extra: Record<string, string> = {}) {
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json", ...extra };
}

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers: { ...serviceHeaders(), ...(init.headers || {}) } });
  if (!response.ok) throw new Error(`AI usage persistence failed (${response.status}): ${await response.text()}`);
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return text ? JSON.parse(text) : (undefined as T);
}

function estimatedCost(model: string, usage: UsageMetadata | undefined, images: number) {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return null;
  const input = usage?.promptTokenCount || 0;
  const output = usage?.candidatesTokenCount || 0;
  const thinking = usage?.thoughtsTokenCount || 0;
  let cost = (input / 1_000_000) * pricing.inputPerMillion;
  if (pricing.image1k && images > 0) {
    // Gemini image-token counts include the generated image itself. Charge image output
    // at Google's published 1K equivalent instead of double-counting those tokens as text.
    const imageOutputTokens = (usage?.candidatesTokensDetails || [])
      .filter(item => String(item.modality || "").toUpperCase() === "IMAGE")
      .reduce((sum, item) => sum + (item.tokenCount || 0), 0);
    const textOutput = Math.max(0, output - imageOutputTokens);
    cost += images * pricing.image1k + ((textOutput + thinking) / 1_000_000) * pricing.outputPerMillion;
  } else {
    cost += ((output + thinking) / 1_000_000) * pricing.outputPerMillion;
  }
  return Number(cost.toFixed(6));
}

function errorFields(error: unknown) {
  const anyError = error as any;
  return {
    error_code: String(anyError?.status || anyError?.code || anyError?.name || "error").slice(0, 120),
    error_message: String(anyError?.message || error || "Unknown AI error").slice(0, 1000),
  };
}

async function insertEvent(event: Record<string, unknown>) {
  await rest("ai_usage_events", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(event) });
}

export async function assertAiUsageAllowed(userId: string, operation: AiOperation) {
  const limits = await rest<Array<{ monthly_budget_usd?: number | null; daily_request_limit?: number | null; monthly_image_limit?: number | null; enabled?: boolean }>>(
    `ai_usage_limits?user_id=eq.${encodeURIComponent(userId)}&select=monthly_budget_usd,daily_request_limit,monthly_image_limit,enabled&limit=1`,
  );
  const limit = limits[0];
  if (!limit || limit.enabled === false) return;

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const rows = await rest<Array<{ estimated_cost_usd?: number | string | null; image_count?: number | null; created_at: string }>>(
    `ai_usage_events?user_id=eq.${encodeURIComponent(userId)}&created_at=gte.${encodeURIComponent(monthStart)}&select=estimated_cost_usd,image_count,created_at`,
  );
  const monthSpend = rows.reduce((sum, row) => sum + Number(row.estimated_cost_usd || 0), 0);
  const monthImages = rows.reduce((sum, row) => sum + Number(row.image_count || 0), 0);
  const dailyRequests = rows.filter(row => row.created_at >= dayStart).length;

  if (limit.monthly_budget_usd != null && monthSpend >= Number(limit.monthly_budget_usd)) {
    throw Object.assign(new Error("Monthly AI budget reached"), { status: 429, code: "AI_MONTHLY_BUDGET" });
  }
  if (limit.daily_request_limit != null && dailyRequests >= Number(limit.daily_request_limit)) {
    throw Object.assign(new Error("Daily AI request limit reached"), { status: 429, code: "AI_DAILY_LIMIT" });
  }
  if (operation === "dream_image" && limit.monthly_image_limit != null && monthImages >= Number(limit.monthly_image_limit)) {
    throw Object.assign(new Error("Monthly dream-image limit reached"), { status: 429, code: "AI_IMAGE_LIMIT" });
  }
}

export async function meterGeminiCall<T>({ userId, operation, model, execute, getUsage, imageCount, metadata = {} }: MeterOptions<T>): Promise<T> {
  await assertAiUsageAllowed(userId, operation);
  const started = Date.now();
  try {
    const result = await execute();
    const usage = getUsage?.(result);
    const images = imageCount?.(result) || 0;
    await insertEvent({
      user_id: userId,
      operation,
      model,
      provider: "google-gemini",
      input_tokens: usage?.promptTokenCount ?? null,
      output_tokens: usage?.candidatesTokenCount ?? null,
      thinking_tokens: usage?.thoughtsTokenCount ?? null,
      total_tokens: usage?.totalTokenCount ?? null,
      image_count: images,
      estimated_cost_usd: estimatedCost(model, usage, images),
      latency_ms: Date.now() - started,
      success: true,
      cache_hit: false,
      metadata,
    }).catch(error => console.warn("AI usage event write failed", error));
    return result;
  } catch (error) {
    await insertEvent({
      user_id: userId,
      operation,
      model,
      provider: "google-gemini",
      image_count: 0,
      estimated_cost_usd: 0,
      latency_ms: Date.now() - started,
      success: false,
      cache_hit: false,
      ...errorFields(error),
      metadata,
    }).catch(writeError => console.warn("AI usage failure event write failed", writeError));
    throw error;
  }
}

export async function logAiCacheHit(userId: string, operation: AiOperation, model: string, metadata: Record<string, unknown> = {}) {
  await insertEvent({
    user_id: userId,
    operation,
    model,
    provider: "google-gemini",
    image_count: 0,
    estimated_cost_usd: 0,
    latency_ms: 0,
    success: true,
    cache_hit: true,
    metadata,
  }).catch(error => console.warn("AI cache-hit usage event write failed", error));
}
