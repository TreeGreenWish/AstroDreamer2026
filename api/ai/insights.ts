import { getCached, hashObject, setCached } from "../../src/server/aiCache.js";
import { buildInsightEvidence } from "../../src/server/insightEvidence.js";
import { interpretInsightEvidence } from "../../src/server/insightInterpreter.js";
import { requireAuthenticatedUser } from "../../src/server/requestAuth.js";

export const config = { maxDuration: 300 };

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const user = await requireAuthenticatedUser(req);
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const dreams = Array.isArray(body.dreams) ? body.dreams : [];
    const evidence = buildInsightEvidence(dreams);
    const cacheKey = `user:${user.id}:insights-evidence-v2:${hashObject(evidence)}`;
    const cached = await getCached<string[]>(cacheKey);
    if (cached) return res.status(200).json(cached);
    const insights = await interpretInsightEvidence(evidence);
    await setCached(cacheKey, "insights-evidence-v2", insights, null);
    return res.status(200).json(insights);
  } catch (error: any) {
    console.error("Insight generation failed", error);
    const status = Number(error?.status || 500);
    return res.status(status).json({ error: error instanceof Error ? error.message : "Insight generation failed" });
  }
}
