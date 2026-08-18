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
  } catch (error) {
    console.error("Dream image generation failed", error);
    const message = error instanceof Error ? error.message : "Dream image generation failed";
    return res.status(500).json({ error: message });
  }
}
