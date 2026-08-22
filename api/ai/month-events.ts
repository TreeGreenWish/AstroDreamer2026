import { getMonthAstrologyEvents } from "../../src/server/geminiService.js";
import { getCached, nextMonthBoundary, setCached } from "../../src/server/aiCache.js";
import { logAiCacheHit, meterEstimatedCall } from "../../src/server/aiUsage.js";
import { requireAuthenticatedUser } from "../../src/server/requestAuth.js";

export const config = { maxDuration: 300 };
const MODEL = "gemini-3-flash-preview";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const user = await requireAuthenticatedUser(req);
    const { month, year } = req.body || {};
    if (!month || !year) return res.status(400).json({ error: "month and year are required" });
    const cacheKey = `month-events:${String(year)}:${String(month).toLowerCase()}`;
    const cached = await getCached<any[]>(cacheKey);
    if (cached) {
      await logAiCacheHit(user.id, "month_astrology", MODEL);
      return res.status(200).json(cached);
    }
    const result = await meterEstimatedCall({
      userId: user.id,
      operation: "month_astrology",
      model: MODEL,
      input: { month, year },
      execute: () => getMonthAstrologyEvents(month, year),
    });
    await setCached(cacheKey, "month-events", result, nextMonthBoundary(String(year), String(month)));
    return res.status(200).json(result);
  } catch (error: any) {
    console.error("Month events failed", error);
    const status = Number(error?.status || 500);
    return res.status(status).json({ error: error instanceof Error ? error.message : "Month events failed", code: error?.code });
  }
}
