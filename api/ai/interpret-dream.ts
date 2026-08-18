import { dataStore } from "../../src/server/dataStore.js";
import { interpretDream } from "../../src/server/geminiService.js";
import type { Dream } from "../../src/types.js";

export const config = { maxDuration: 300 };

function sameDream(a: Dream, b: Dream) {
  return a.title === b.title &&
    a.content === b.content &&
    a.date === b.date &&
    a.time === b.time &&
    a.location_name === b.location_name;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { dream, userProfile } = req.body || {};
    if (!dream || !userProfile) {
      return res.status(400).json({ error: "Dream and user profile are required" });
    }

    // Durability first: persist the raw dream before any AI work begins.
    const existing = (await dataStore.getDreams()).find((item) => sameDream(item, dream));
    const persisted = existing || await dataStore.createDream(dream);

    const analysis = await interpretDream(dream, userProfile);
    return res.status(200).json({ ...analysis, persisted_dream_id: persisted.id });
  } catch (error) {
    console.error("Dream interpretation failed after raw-save attempt", error);
    const message = error instanceof Error ? error.message : "Dream interpretation failed";
    return res.status(500).json({ error: message });
  }
}
