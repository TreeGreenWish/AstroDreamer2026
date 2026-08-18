import { getCurrentAstrology } from "../../src/server/geminiService.js";

export const config = { maxDuration: 300 };

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { lat, lng, date, time } = req.body || {};
    return res.status(200).json(await getCurrentAstrology(lat, lng, date, time));
  } catch (error) {
    console.error("Current astrology failed", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Current astrology failed" });
  }
}
