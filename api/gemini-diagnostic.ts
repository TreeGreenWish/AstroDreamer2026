import { generateProfileAnalysis } from "../src/server/geminiService.js";
import type { UserProfile } from "../src/types.js";

export const config = { maxDuration: 300 };

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const result = await generateProfileAnalysis({
      name: "AstraDream Diagnostic",
      dob: "2000-01-01",
      tob: "12:00",
      lob_lat: 0,
      lob_lng: 0,
      lob_name: "Greenwich"
    } as UserProfile);
    return res.status(200).json({ ok: true, modelResponse: Boolean(result?.sun_sign) });
  } catch (error) {
    console.error("Gemini diagnostic failed", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Gemini diagnostic failed" });
  }
}
