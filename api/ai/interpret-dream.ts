import { dataStore } from "../../src/server/dataStore.js";
import { deterministicDreamFacts } from "../../src/server/deterministicAstrology.js";
import { interpretDreamV2 } from "../../src/server/dreamInterpreterV2.js";
import type { Dream, DreamAstrologyV1 } from "../../src/types.js";

export const config = { maxDuration: 300 };

function normalizeTime(value?: string) {
  return (value || "").slice(0, 5);
}

function sameDream(a: Dream, b: Dream) {
  return a.title === b.title &&
    a.content === b.content &&
    a.date === b.date &&
    normalizeTime(a.time) === normalizeTime(b.time) &&
    a.location_name === b.location_name;
}

function existingAnalysis(dream: Dream) {
  return {
    interpretation: dream.interpretation,
    analysis_json: dream.analysis_json,
    feature_json: dream.feature_json,
    analysis_version: dream.analysis_version,
    feature_version: dream.feature_version,
    astrology_json: dream.astrology_json,
    astrology_version: dream.astrology_version,
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
    pending: false,
  };
}

function isQuotaOrRateLimit(error: any) {
  const status = Number(error?.status || error?.code || 0);
  const message = error instanceof Error ? error.message : String(error || "");
  return status === 429 || /quota|rate.?limit|RESOURCE_EXHAUSTED/i.test(message);
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
    if (existing?.id && existing.interpretation && existing.analysis_version === 1 && existing.feature_version === 1) {
      return res.status(200).json(existingAnalysis(existing));
    }

    const timezone = dream.timezone_name || existing?.timezone_name || "UTC";
    const dreamWithTimezone: Dream = { ...dream, timezone_name: timezone };
    const deterministicFacts = deterministicDreamFacts(dreamWithTimezone.date, dreamWithTimezone.time, timezone);

    const persisted = existing || await dataStore.createDream({ ...dreamWithTimezone, enrichment_status: "raw" });
    if (!persisted.id) throw new Error("Persisted dream is missing an id");

    await dataStore.updateDream(persisted.id, {
      ...persisted,
      ...dreamWithTimezone,
      enrichment_status: "interpreting",
      interpretation_error: null,
    });

    try {
      const analysis = await interpretDreamV2(dreamWithTimezone, userProfile);
      const deterministicAstrology: DreamAstrologyV1 = {
        version: 1,
        calculated_at: new Date().toISOString(),
        source: "astradream-deterministic-partial-v1",
        bodies: {},
        moon_phase: deterministicFacts.moon_phase,
        moon_illumination: deterministicFacts.moon_illumination,
        aspects: [],
      };

      const enrichedDream: Dream = {
        ...persisted,
        ...dreamWithTimezone,
        interpretation: analysis.interpretation,
        analysis_json: analysis.analysis_json,
        analysis_version: 1,
        feature_json: analysis.feature_json,
        feature_version: 1,
        astrology_json: deterministicAstrology,
        astrology_version: 1,
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
        moon_phase: deterministicFacts.moon_phase,
        day_number: deterministicFacts.day_number,
        planetary_influences: analysis.planetary_influences as Dream["planetary_influences"],
        tags: analysis.tags,
        enrichment_status: "interpreted",
        interpreted_at: new Date().toISOString(),
        interpretation_error: null,
        id: persisted.id,
      };

      await dataStore.updateDream(persisted.id, enrichedDream);
      return res.status(200).json({
        ...analysis,
        moon_phase: deterministicFacts.moon_phase,
        moon_illumination: deterministicFacts.moon_illumination,
        day_number: deterministicFacts.day_number,
        instant_utc: deterministicFacts.instant_utc,
        astrology_json: deterministicAstrology,
        astrology_version: 1,
        analysis_version: 1,
        feature_version: 1,
        persisted_dream_id: persisted.id,
        pending: false,
      });
    } catch (error: any) {
      const message = error instanceof Error ? error.message : "Dream interpretation failed";
      await dataStore.updateDream(persisted.id, {
        ...persisted,
        ...dreamWithTimezone,
        moon_phase: deterministicFacts.moon_phase,
        day_number: deterministicFacts.day_number,
        astrology_json: {
          version: 1,
          calculated_at: new Date().toISOString(),
          source: "astradream-deterministic-partial-v1",
          bodies: {},
          moon_phase: deterministicFacts.moon_phase,
          moon_illumination: deterministicFacts.moon_illumination,
          aspects: [],
        },
        astrology_version: 1,
        enrichment_status: "raw",
        interpretation_error: message,
      });

      if (isQuotaOrRateLimit(error)) {
        console.warn("Dream saved; interpretation deferred because Gemini quota is exhausted", error);
        return res.status(200).json({
          persisted_dream_id: persisted.id,
          pending: true,
          interpretation: null,
          tags: [],
          moon_phase: deterministicFacts.moon_phase,
          day_number: deterministicFacts.day_number,
        });
      }

      throw error;
    }
  } catch (error) {
    console.error("Dream interpretation failed after raw-save attempt", error);
    const message = error instanceof Error ? error.message : "Dream interpretation failed";
    return res.status(500).json({ error: message });
  }
}
