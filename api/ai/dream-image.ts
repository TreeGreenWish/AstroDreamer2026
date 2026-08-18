import { generateDreamImage } from "../../src/server/geminiService.js";

export const config = { maxDuration: 300 };

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { dream } = req.body || {};
    if (!dream) return res.status(400).json({ error: "Dream is required" });
    return res.status(200).json(await generateDreamImage(dream));
  } catch (error: any) {
    console.error("Dream image generation failed; continuing without image", error);

    // Image generation is optional. A quota/rate-limit/provider failure must never
    // prevent the dream text and AI interpretation from being saved.
    const status = Number(error?.status || error?.code || 0);
    const message = error instanceof Error ? error.message : String(error || "");
    const isQuotaOrRateLimit = status === 429 || /quota|rate.?limit|RESOURCE_EXHAUSTED/i.test(message);

    if (isQuotaOrRateLimit) {
      return res.status(200).json(null);
    }

    // Treat other image-provider failures as non-fatal as well. We can retry image
    // generation separately later without risking the journal entry itself.
    return res.status(200).json(null);
  }
}
