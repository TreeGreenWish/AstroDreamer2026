import { randomUUID } from "node:crypto";
import { dataStore } from "../../src/server/dataStore.js";
import { deterministicDreamAstrology } from "../../src/server/deterministicAstrology.js";
import { interpretDreamV2 } from "../../src/server/dreamInterpreterV2.js";
import { revisitDreamWithContext } from "../../src/server/dreamRevisit.js";
import { logAiCacheHit, meterEstimatedCall } from "../../src/server/aiUsage.js";
import { requireAuthenticatedUser } from "../../src/server/requestAuth.js";
import type { Dream, DreamRevisit, PersonalContextFact, UserProfile } from "../../src/types.js";

export const config = { maxDuration: 300 };
const EXACT_EPHEMERIS_SOURCE = "astronomy-engine-2.1.19-geocentric-v1";
const DATE_ONLY_EPHEMERIS_SOURCE = "astronomy-engine-2.1.19-geocentric-date-only-v1";
const TEXT_MODEL = "gemini-3-flash-preview";

function normalizeTime(value?: string | null) { return (value || "").slice(0, 5); }
function sameDream(a: Dream, b: Dream) {
  return a.title === b.title && a.content === b.content && a.date === b.date && Boolean(a.time_known ?? true) === Boolean(b.time_known ?? true) && normalizeTime(a.time) === normalizeTime(b.time) && a.location_name === b.location_name;
}
function signsFromAstrology(astrology: ReturnType<typeof deterministicDreamAstrology>) {
  const signs = astrology.reliable_signs || Object.fromEntries(Object.entries(astrology.bodies || {}).map(([name, body]) => [name, body.sign]));
  return {
    sun_sign: signs.sun, moon_sign: signs.moon,
    mercury_sign: signs.mercury, venus_sign: signs.venus,
    mars_sign: signs.mars, jupiter_sign: signs.jupiter,
    saturn_sign: signs.saturn, uranus_sign: signs.uranus,
    neptune_sign: signs.neptune, pluto_sign: signs.pluto,
  };
}
function existingAnalysis(dream: Dream) {
  return {
    interpretation: dream.interpretation, analysis_json: dream.analysis_json, feature_json: dream.feature_json,
    analysis_version: dream.analysis_version, feature_version: dream.feature_version,
    astrology_json: dream.astrology_json, astrology_version: dream.astrology_version,
    sun_sign: dream.sun_sign, moon_sign: dream.moon_sign, mercury_sign: dream.mercury_sign,
    venus_sign: dream.venus_sign, mars_sign: dream.mars_sign, jupiter_sign: dream.jupiter_sign,
    saturn_sign: dream.saturn_sign, uranus_sign: dream.uranus_sign, neptune_sign: dream.neptune_sign,
    pluto_sign: dream.pluto_sign, moon_phase: dream.moon_phase, day_number: dream.day_number,
    planetary_influences: dream.planetary_influences, tags: dream.tags || [], context_facts: dream.context_facts || [],
    revisits: dream.revisits || [], persisted_dream_id: dream.id, pending: false,
  };
}
function isQuotaOrRateLimit(error: any) {
  const status = Number(error?.status || error?.code || 0);
  const message = error instanceof Error ? error.message : String(error || "");
  return status === 429 || /quota|rate.?limit|RESOURCE_EXHAUSTED/i.test(message);
}
function normalizeFactPart(value: string) { return (value || "").trim().toLowerCase().replace(/\s+/g, " "); }
function factKey(fact: PersonalContextFact) { return `${normalizeFactPart(fact.subject)}|${normalizeFactPart(fact.predicate)}`; }
function mergeExplicitContext(existing: PersonalContextFact[], incoming: PersonalContextFact[], dreamId: number): PersonalContextFact[] {
  const merged = new Map<string, PersonalContextFact>();
  for (const fact of existing || []) merged.set(factKey(fact), fact);
  for (const fact of incoming || []) {
    if (fact.confidence !== "explicit") continue;
    const stored: PersonalContextFact = { ...fact, confidence: "explicit", source_dream_id: dreamId, updated_at: new Date().toISOString() };
    merged.set(factKey(stored), stored);
  }
  return [...merged.values()];
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const user = await requireAuthenticatedUser(req);
    const { dream, userProfile, action = "interpret" } = req.body || {};
    if (!dream || !userProfile) return res.status(400).json({ error: "Dream and user profile are required" });

    const timeKnown = dream.time_known !== false;
    if (timeKnown && !dream.time) return res.status(400).json({ error: "Dream time is required unless Unknown time is selected" });
    const normalizedDream: Dream = { ...dream, time_known: timeKnown, time: timeKnown ? dream.time : null };
    const existing = (await dataStore.getDreams(user.id)).find(item => sameDream(item, normalizedDream));
    const timezone = normalizedDream.timezone_name || existing?.timezone_name || "UTC";
    const dreamWithTimezone: Dream = { ...normalizedDream, timezone_name: timezone };
    const persisted = existing || await dataStore.createDream({ ...dreamWithTimezone, enrichment_status: "raw" }, user.id);
    if (!persisted.id) throw new Error("Persisted dream is missing an id");

    const astrology = deterministicDreamAstrology(dreamWithTimezone.date, dreamWithTimezone.time, timezone, timeKnown);
    const reliableSigns = signsFromAstrology(astrology);
    const factualUpdate: Dream = {
      ...persisted, ...dreamWithTimezone, ...reliableSigns,
      moon_phase: astrology.moon_phase, day_number: astrology.day_number,
      astrology_json: astrology, astrology_version: 2, id: persisted.id,
    };
    await dataStore.updateDream(persisted.id, factualUpdate, user.id);

    if (action === "revisit") {
      if (!factualUpdate.interpretation) return res.status(400).json({ error: "Interpret the dream before revisiting it" });
      const notes = factualUpdate.notes || [];
      if (!notes.length) return res.status(400).json({ error: "Add a personal note before revisiting this dream" });
      const previousRevisits = factualUpdate.revisits || [];
      const latest = previousRevisits[previousRevisits.length - 1];
      if (latest && latest.note_count >= notes.length) return res.status(409).json({ error: "No new personal notes have been added since the last revisit" });

      const result = await meterEstimatedCall({
        userId: user.id, operation: "dream_revisit", model: TEXT_MODEL,
        input: { dream: factualUpdate, userProfile, astrology },
        execute: () => revisitDreamWithContext(factualUpdate, userProfile, astrology),
        metadata: { dream_id: persisted.id, note_count: notes.length, time_precision: astrology.time_precision },
      });
      const contextFacts = (result.context_facts || []).map(fact => ({ ...fact, source_dream_id: persisted.id, updated_at: new Date().toISOString() }));
      const revisit: DreamRevisit = { ...result, context_facts: contextFacts, id: randomUUID(), created_at: new Date().toISOString(), note_count: notes.length };
      const updatedDream: Dream = { ...factualUpdate, context_facts: contextFacts, revisits: [...previousRevisits, revisit] };
      await dataStore.updateDream(persisted.id, updatedDream, user.id);
      const currentProfile = (await dataStore.getProfile(user.id)) || userProfile as UserProfile;
      const contextMemory = mergeExplicitContext(currentProfile.context_memory || [], contextFacts, persisted.id);
      await dataStore.saveProfile({ ...currentProfile, context_memory: contextMemory, context_memory_version: 1 }, user.id);
      return res.status(200).json({ revisit, context_memory_count: contextMemory.length, persisted_dream_id: persisted.id, pending: false });
    }

    const expectedSource = timeKnown ? EXACT_EPHEMERIS_SOURCE : DATE_ONLY_EPHEMERIS_SOURCE;
    const alreadyEphemerisAware = existing?.interpretation && (existing.analysis_version || 0) >= 2 && existing.astrology_json?.source === expectedSource;
    if (alreadyEphemerisAware) {
      await logAiCacheHit(user.id, "dream_interpretation", TEXT_MODEL, { dream_id: persisted.id, reuse: "persisted_analysis" });
      return res.status(200).json(existingAnalysis({ ...existing, ...factualUpdate }));
    }

    await dataStore.updateDream(persisted.id, { ...factualUpdate, enrichment_status: "interpreting", interpretation_error: null }, user.id);
    try {
      const currentProfile = (await dataStore.getProfile(user.id)) || userProfile as UserProfile;
      const analysis = await meterEstimatedCall({
        userId: user.id, operation: "dream_interpretation", model: TEXT_MODEL,
        input: { dream: dreamWithTimezone, userProfile: currentProfile, astrology },
        execute: () => interpretDreamV2(dreamWithTimezone, currentProfile, astrology),
        metadata: { dream_id: persisted.id, analysis_version: 2, time_precision: astrology.time_precision },
      });
      const enrichedDream: Dream = {
        ...factualUpdate, interpretation: analysis.interpretation, analysis_json: analysis.analysis_json,
        analysis_version: 2, feature_json: analysis.feature_json, feature_version: 1,
        planetary_influences: analysis.planetary_influences as Dream["planetary_influences"], tags: analysis.tags,
        enrichment_status: "interpreted", interpreted_at: new Date().toISOString(), interpretation_error: null, id: persisted.id,
      };
      await dataStore.updateDream(persisted.id, enrichedDream, user.id);
      return res.status(200).json({
        ...analysis, ...reliableSigns, moon_phase: astrology.moon_phase, moon_illumination: astrology.moon_illumination,
        day_number: astrology.day_number, instant_utc: astrology.instant_utc, astrology_json: astrology,
        astrology_version: 2, analysis_version: 2, feature_version: 1, persisted_dream_id: persisted.id, pending: false,
      });
    } catch (error: any) {
      const message = error instanceof Error ? error.message : "Dream interpretation failed";
      await dataStore.updateDream(persisted.id, { ...factualUpdate, enrichment_status: persisted.interpretation ? "interpreted" : "raw", interpretation_error: message }, user.id);
      if (isQuotaOrRateLimit(error)) {
        console.warn("Dream saved with deterministic astrology; interpretation deferred because Gemini quota or AstraDream AI budget is exhausted", error);
        return res.status(200).json({ persisted_dream_id: persisted.id, pending: true, interpretation: persisted.interpretation || null, tags: persisted.tags || [], ...reliableSigns, moon_phase: astrology.moon_phase, day_number: astrology.day_number, astrology_json: astrology, astrology_version: 2 });
      }
      throw error;
    }
  } catch (error: any) {
    console.error("Dream interpretation/revisit failed after raw-save attempt", error);
    const status = Number(error?.status || 500);
    return res.status(status).json({ error: error instanceof Error ? error.message : "Dream interpretation failed", code: error?.code });
  }
}
