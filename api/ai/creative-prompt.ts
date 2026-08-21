import { generateCreativePrompt } from "../../src/server/geminiService.js";
import { getCached, hashObject, setCached } from "../../src/server/aiCache.js";
import { requireAuthenticatedUser } from "../../src/server/requestAuth.js";

export const config = { maxDuration: 300 };

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const user = await requireAuthenticatedUser(req);
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const dreams = Array.isArray(body.dreams) ? body.dreams : [];
    const insights = Array.isArray(body.insights) ? body.insights : [];
    const cacheKey = `user:${user.id}:creative-prompt:${hashObject({ dreams, insights })}`;
    const cached = await getCached<any>(cacheKey);
    if (cached) return res.status(200).json(cached);
    const result = await generateCreativePrompt(dreams, insights);
    await setCached(cacheKey, "creative-prompt", result, null);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error("Creative prompt generation failed", error);
    const status = Number(error?.status || 500);
    return res.status(status).json({ error: error instanceof Error ? error.message : "Creative prompt generation failed" });
  }
}
