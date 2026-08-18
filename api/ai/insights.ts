import { generateInsights } from "../../src/server/geminiService.js";
import { getCached, hashObject, setCached } from "../../src/server/aiCache.js";

export const config = { maxDuration: 300 };

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const dreams = Array.isArray(body.dreams) ? body.dreams : [];
    const cacheKey = `insights:${hashObject(dreams)}`;
    const cached = await getCached<string[]>(cacheKey);
    if (cached) return res.status(200).json(cached);

    const insights = await generateInsights(dreams);
    await setCached(cacheKey, "insights", insights, null);
    return res.status(200).json(insights);
  } catch (error) {
    console.error("Insight generation failed", error);
    const message = error instanceof Error ? error.message : "Insight generation failed";
    return res.status(500).json({ error: message });
  }
}
