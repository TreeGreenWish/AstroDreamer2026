import { generateDreamImage } from "../../src/server/geminiService.js";
import { getCached, setCached } from "../../src/server/aiCache.js";
import { requireAuthenticatedUser } from "../../src/server/requestAuth.js";

export const config = { maxDuration: 300 };
const IMAGE_QUOTA_COOLDOWN_KEY = "provider-cooldown:gemini-dream-image";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    await requireAuthenticatedUser(req);
    const { dream } = req.body || {};
    if (!dream) return res.status(400).json({ error: "Dream is required" });
    const coolingDown = await getCached<boolean>(IMAGE_QUOTA_COOLDOWN_KEY);
    if (coolingDown) return res.status(200).json(null);
    return res.status(200).json(await generateDreamImage(dream));
  } catch (error: any) {
    const status = Number(error?.status || error?.code || 0);
    if (status === 401) return res.status(401).json({ error: "Authentication required" });
    console.error("Dream image generation failed; continuing without image", error);
    const message = error instanceof Error ? error.message : String(error || "");
    const isQuotaOrRateLimit = status === 429 || /quota|rate.?limit|RESOURCE_EXHAUSTED/i.test(message);
    if (isQuotaOrRateLimit) {
      await setCached(IMAGE_QUOTA_COOLDOWN_KEY, "provider-cooldown", true, new Date(Date.now() + 60 * 60 * 1000)).catch(cacheError => console.warn("Failed to persist image quota cooldown", cacheError));
    }
    return res.status(200).json(null);
  }
}
