import { generateInsights } from "../../src/server/geminiService.js";

export const config = { maxDuration: 300 };

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const insights = await generateInsights(body.dreams || []);
    return res.status(200).json(insights);
  } catch (error) {
    console.error("Insight generation failed", error);
    const message = error instanceof Error ? error.message : "Insight generation failed";
    return res.status(500).json({ error: message });
  }
}
