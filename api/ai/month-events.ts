import { getMonthAstrologyEvents } from "../../src/server/geminiService.js";

export const config = { maxDuration: 300 };

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { month, year } = req.body || {};
    return res.status(200).json(await getMonthAstrologyEvents(month, year));
  } catch (error) {
    console.error("Month events failed", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Month events failed" });
  }
}
