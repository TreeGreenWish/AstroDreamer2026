import { generateCreativePrompt } from "../../src/server/geminiService.js";
import { getCached, hashObject, setCached } from "../../src/server/aiCache.js";

export const config = { maxDuration: 300 };

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const dreams = Array.isArray(body.dreams) ? body.dreams : [];
    const insights = Array.isArray(body.insights) ? body.insights : [];
    const cacheKey = `creative-prompt:${hashObject({ dreams, insights })}`;
    const cached = await getCached<any>(cacheKey);
    if (cached) return res.status(200).json(cached);

    const result = await generateCreativePrompt(dreams, insights);
    await setCached(cacheKey, "creative-prompt", result, null);
    return res.status(200).json(result);
  } catch (error) {
    console.error("Creative prompt generation failed", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Creative prompt generation failed" });
  }
}
