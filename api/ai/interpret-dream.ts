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

function existingAnalysis(dream: Dream) {
  return {
    interpretation: dream.interpretation,
    sun_sign: dream.sun_sign,
    moon_sign: dream.moon_sign,
    mercury_sign: dream.mercury_sign,
    venus_sign: dream.venus_sign,
    mars_sign: dream.mars_sign,
    jupiter_sign: dream.jupiter_sign,
    saturn_sign: dream.saturn_sign,
    uranus_sign: dream.uranus_sign,
    neptune_sign: dream.neptune_sign,
    pluto_sign: dream.pluto_sign,
    moon_phase: dream.moon_phase,
    day_number: dream.day_number,
    planetary_influences: dream.planetary_influences,
    tags: dream.tags || [],
    persisted_dream_id: dream.id,
  };
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

    const existing = (await dataStore.getDreams()).find((item) => sameDream(item, dream));
    if (existing?.id && existing.interpretation) {
      return res.status(200).json(existingAnalysis(existing));
    }

    const persisted = existing || await dataStore.createDream({ ...dream, enrichment_status: "raw" });
    if (!persisted.id) throw new Error("Persisted dream is missing an id");

    await dataStore.updateDream(persisted.id, { ...persisted, enrichment_status: "interpreting", interpretation_error: null });

    try {
      const analysis = await interpretDream(dream, userProfile);
      const enrichedDream: Dream = {
        ...persisted,
        ...dream,
        interpretation: analysis.interpretation,
        sun_sign: analysis.sun_sign,
        moon_sign: analysis.moon_sign,
        mercury_sign: analysis.mercury_sign,
        venus_sign: analysis.venus_sign,
        mars_sign: analysis.mars_sign,
        jupiter_sign: analysis.jupiter_sign,
        saturn_sign: analysis.saturn_sign,
        uranus_sign: analysis.uranus_sign,
        neptune_sign: analysis.neptune_sign,
        pluto_sign: analysis.pluto_sign,
        moon_phase: analysis.moon_phase,
        day_number: analysis.day_number,
        planetary_influences: analysis.planetary_influences,
        tags: analysis.tags,
        enrichment_status: "interpreted",
        interpreted_at: new Date().toISOString(),
        interpretation_error: null,
        id: persisted.id,
      };

      await dataStore.updateDream(persisted.id, enrichedDream);
      return res.status(200).json({ ...analysis, persisted_dream_id: persisted.id });
    } catch (error) {
      await dataStore.updateDream(persisted.id, {
        ...persisted,
        enrichment_status: "raw",
        interpretation_error: error instanceof Error ? error.message : "Dream interpretation failed",
      });
      throw error;
    }
  } catch (error) {
    console.error("Dream interpretation failed after raw-save attempt", error);
    const message = error instanceof Error ? error.message : "Dream interpretation failed";
    return res.status(500).json({ error: message });
  }
}
