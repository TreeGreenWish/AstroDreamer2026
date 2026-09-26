import { getCurrentAstrology } from "../../src/server/geminiService.js";
import { endOfLocalDay, getCached, setCached } from "../../src/server/aiCache.js";
import { logAiCacheHit, meterEstimatedCall } from "../../src/server/aiUsage.js";
import { requireAuthenticatedUser } from "../../src/server/requestAuth.js";

export const config = { maxDuration: 300 };
const MODEL = "gemini-3-flash-preview";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const user = await requireAuthenticatedUser(req);
    const { lat, lng, date, time } = req.body || {};
    if (lat == null || lng == null || !date || !time) return res.status(400).json({ error: "lat, lng, date, and time are required" });
    const cacheKey = `current-astrology:${date}:${Number(lat).toFixed(2)}:${Number(lng).toFixed(2)}`;
    const cached = await getCached<any>(cacheKey);
    if (cached) {
      await logAiCacheHit(user.id, "current_astrology", MODEL);
      return res.status(200).json(cached);
    }
    const result = await meterEstimatedCall({
      userId: user.id,
      operation: "current_astrology",
      model: MODEL,
      input: { lat, lng, date, time },
      execute: () => getCurrentAstrology(lat, lng, date, time),
    });
    await setCached(cacheKey, "current-astrology", result, endOfLocalDay(date));
    return res.status(200).json(result);
  } catch (error: any) {
    console.error("Current astrology failed", error);
    const status = Number(error?.status || 500);
    return res.status(status).json({ error: error instanceof Error ? error.message : "Current astrology failed", code: error?.code });
  }
}
