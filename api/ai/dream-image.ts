import { generateDreamRecallImage } from "../../src/server/dreamImageV2.js";
import { getCached, setCached } from "../../src/server/aiCache.js";
import { meterEstimatedCall } from "../../src/server/aiUsage.js";
import { requireAuthenticatedUser } from "../../src/server/requestAuth.js";

export const config = { maxDuration: 300 };
const IMAGE_QUOTA_COOLDOWN_KEY = "provider-cooldown:gemini-dream-image";
const IMAGE_MODEL = "gemini-3.1-flash-lite-image";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const user = await requireAuthenticatedUser(req);
    const { dream } = req.body || {};
    if (!dream) return res.status(400).json({ error: "Dream is required" });
    const coolingDown = await getCached<boolean>(IMAGE_QUOTA_COOLDOWN_KEY);
    if (coolingDown) return res.status(200).json(null);
    const result = await meterEstimatedCall({
      userId: user.id,
      operation: "dream_image",
      model: IMAGE_MODEL,
      input: { title: dream.title, content: dream.content, image_prompt_version: 2 },
      execute: () => generateDreamRecallImage(dream),
      imageCount: value => value ? 1 : 0,
      metadata: { resolution: "1K", aspect_ratio: "16:9", composition: "single-scene-recall-anchor-v2" },
    });
    return res.status(200).json(result);
  } catch (error: any) {
    const status = Number(error?.status || error?.code || 0);
    if (status === 401) return res.status(401).json({ error: "Authentication required" });
    if (error?.code === "AI_MONTHLY_BUDGET" || error?.code === "AI_DAILY_LIMIT" || error?.code === "AI_IMAGE_LIMIT" || error?.code === "AI_PROVIDER_CIRCUIT_OPEN") {
      return res.status(status || 429).json({ error: error.message, code: error.code });
    }
    console.error("Dream image generation failed; continuing without image", error);
    const message = error instanceof Error ? error.message : String(error || "");
    const isQuotaOrRateLimit = status === 429 || /quota|rate.?limit|RESOURCE_EXHAUSTED/i.test(message);
    if (isQuotaOrRateLimit) {
      await setCached(IMAGE_QUOTA_COOLDOWN_KEY, "provider-cooldown", true, new Date(Date.now() + 60 * 60 * 1000)).catch(cacheError => console.warn("Failed to persist image quota cooldown", cacheError));
    }
    return res.status(200).json(null);
  }
}
