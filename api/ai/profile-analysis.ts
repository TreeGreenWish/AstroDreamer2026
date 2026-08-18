import { generateProfileAnalysis } from "../../src/server/geminiService.js";

export const config = { maxDuration: 300 };

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const result = await generateProfileAnalysis(req.body?.profile);
    return res.status(200).json(result);
  } catch (error) {
    console.error("Profile analysis failed", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Profile analysis failed" });
  }
}
