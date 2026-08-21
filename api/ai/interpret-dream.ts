import { dataStore } from "../../src/server/dataStore.js";
import { deterministicDreamAstrology } from "../../src/server/deterministicAstrology.js";
import { interpretDreamV2 } from "../../src/server/dreamInterpreterV2.js";
import type { Dream } from "../../src/types.js";

export const config = { maxDuration: 300 };

const EPHEMERIS_SOURCE = "astronomy-engine-2.1.19-geocentric-v1";

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

function signsFromAstrology(astrology: ReturnType<typeof deterministicDreamAstrology>) {
  return {
    sun_sign: astrology.bodies.sun.sign,
    moon_sign: astrology.bodies.moon.sign,
    mercury_sign: astrology.bodies.mercury.sign,
    venus_sign: astrology.bodies.venus.sign,
    mars_sign: astrology.bodies.mars.sign,
    jupiter_sign: astrology.bodies.jupiter.sign,
    saturn_sign: astrology.bodies.saturn.sign,
    uranus_sign: astrology.bodies.uranus.sign,
    neptune_sign: astrology.bodies.neptune.sign,
    pluto_sign: astrology.bodies.pluto.sign,
  };
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
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { dream, userProfile } = req.body || {};
    if (!dream || !userProfile) return res.status(400).json({ error: "Dream and user profile are required" });

    const existing = (await dataStore.getDreams()).find((item) => sameDream(item, dream));
    const timezone = dream.timezone_name || existing?.timezone_name || "UTC";
    const dreamWithTimezone: Dream = { ...dream, timezone_name: timezone };
    const persisted = existing || await dataStore.createDream({ ...dreamWithTimezone, enrichment_status: "raw" });
    if (!persisted.id) throw new Error("Persisted dream is missing an id");

    // Compute and persist factual astrology before any Gemini call. The dream retains these facts even if AI is unavailable.
    const astrology = deterministicDreamAstrology(dreamWithTimezone.date, dreamWithTimezone.time, timezone);
    const exactSigns = signsFromAstrology(astrology);
    const factualUpdate: Dream = {
      ...persisted,
      ...dreamWithTimezone,
      ...exactSigns,
      moon_phase: astrology.moon_phase,
      day_number: astrology.day_number,
      astrology_json: astrology,
      astrology_version: 2,
      id: persisted.id,
    };

    await dataStore.updateDream(persisted.id, factualUpdate);

    // V2 prose generated before exact ephemeris is intentionally upgraded once. Thereafter an unchanged dream reuses the result.
    const alreadyEphemerisAware = existing?.interpretation &&
      (existing.analysis_version || 0) >= 2 &&
      existing.astrology_json?.source === EPHEMERIS_SOURCE;
    if (alreadyEphemerisAware) return res.status(200).json(existingAnalysis({ ...existing, ...factualUpdate }));

    await dataStore.updateDream(persisted.id, {
      ...factualUpdate,
      enrichment_status: "interpreting",
      interpretation_error: null,
    });

    try {
      const analysis = await interpretDreamV2(dreamWithTimezone, userProfile, astrology);
      const enrichedDream: Dream = {
        ...factualUpdate,
        interpretation: analysis.interpretation,
        analysis_json: analysis.analysis_json,
        analysis_version: 2,
        feature_json: analysis.feature_json,
        feature_version: 1,
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
        ...exactSigns,
        moon_phase: astrology.moon_phase,
        moon_illumination: astrology.moon_illumination,
        day_number: astrology.day_number,
        instant_utc: astrology.instant_utc,
        astrology_json: astrology,
        astrology_version: 2,
        analysis_version: 2,
        feature_version: 1,
        persisted_dream_id: persisted.id,
        pending: false,
      });
    } catch (error: any) {
      const message = error instanceof Error ? error.message : "Dream interpretation failed";
      // Never throw away a previous interpretation during a failed re-interpretation; exact ephemeris facts remain saved.
      await dataStore.updateDream(persisted.id, {
        ...factualUpdate,
        enrichment_status: persisted.interpretation ? "interpreted" : "raw",
        interpretation_error: message,
      });

      if (isQuotaOrRateLimit(error)) {
        console.warn("Dream saved with deterministic astrology; interpretation deferred because Gemini quota is exhausted", error);
        return res.status(200).json({
          persisted_dream_id: persisted.id,
          pending: true,
          interpretation: persisted.interpretation || null,
          tags: persisted.tags || [],
          ...exactSigns,
          moon_phase: astrology.moon_phase,
          day_number: astrology.day_number,
          astrology_json: astrology,
          astrology_version: 2,
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
