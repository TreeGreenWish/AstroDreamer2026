import { GoogleGenAI, Type } from "@google/genai";
import type { Dream, DreamAnalysisV1, DreamFeaturesV1, UserProfile } from "../types.js";

function getAi() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured on the server");
  return new GoogleGenAI({ apiKey });
}

function parseJson(text: string) {
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

const stringArray = { type: Type.ARRAY, items: { type: Type.STRING } } as const;

export type DreamInterpretationV2 = {
  interpretation: string;
  analysis_json: DreamAnalysisV1;
  feature_json: DreamFeaturesV1;
  sun_sign: string;
  moon_sign: string;
  mercury_sign: string;
  venus_sign: string;
  mars_sign: string;
  jupiter_sign: string;
  saturn_sign: string;
  uranus_sign: string;
  neptune_sign: string;
  pluto_sign: string;
  moon_phase: string;
  day_number: number;
  planetary_influences: Record<string, string>;
  tags: string[];
};

export async function interpretDreamV2(dream: Dream, userProfile: UserProfile): Promise<DreamInterpretationV2> {
  const response = await getAi().models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `You are AstraDream's careful dream-analysis layer. Interpret the dream as a personal, contextual experience rather than applying a fixed universal dream dictionary.

Dream:
${JSON.stringify({
  title: dream.title,
  content: dream.content,
  date: dream.date,
  time: dream.time,
  location_name: dream.location_name,
  notes: dream.notes || [],
})}

User context available to this version:
${JSON.stringify({
  birth_chart_interpretation: userProfile.birth_chart_interpretation || null,
  natal_signs: {
    sun: userProfile.sun_sign || null,
    moon: userProfile.moon_sign || null,
    mercury: userProfile.mercury_sign || null,
    venus: userProfile.venus_sign || null,
    mars: userProfile.mars_sign || null,
    jupiter: userProfile.jupiter_sign || null,
    saturn: userProfile.saturn_sign || null,
    uranus: userProfile.uranus_sign || null,
    neptune: userProfile.neptune_sign || null,
    pluto: userProfile.pluto_sign || null,
    rising: userProfile.rising_sign || null,
  },
})}

Interpretation rules:
- Ground every observation in details actually present in the dream.
- Distinguish observation from inference. Do not diagnose the user or claim hidden facts.
- Symbols are contextual: provide multiple plausible meanings when warranted rather than a single universal definition.
- Identify emotional movement, characters/relationships, settings, transformations, conflicts/tensions, unusual objects/actions, and the dream's central psychological or narrative movement.
- Reflection questions must be specific to this dream and genuinely useful for journaling.
- Alternative readings should be meaningfully different, not paraphrases.
- Uncertainty notes should explicitly state where a reading depends on missing waking-life context.
- Keep the top-level interpretation cohesive and readable, roughly 250-450 words. It should feel substantial enough to be worth an AI call without becoming repetitive.
- Extract normalized features for longitudinal analytics. Use short canonical labels (for example "school", "flooding", "bird transformation", "grief", "technology") and avoid duplicates/synonyms within the same list.
- Tags should be useful search/index terms, not generic filler.

Compatibility note: this version still returns zodiac-sign/moon-phase fields used by the current UI. These will be replaced by deterministic ephemeris facts in the next architecture stage. Do not pretend those fields are degree/orb-exact.

Return JSON only.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          interpretation: { type: Type.STRING },
          analysis_json: {
            type: Type.OBJECT,
            properties: {
              version: { type: Type.NUMBER },
              summary: { type: Type.STRING },
              core_interpretation: { type: Type.STRING },
              themes: stringArray,
              symbols: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    context: { type: Type.STRING },
                    possible_meanings: stringArray,
                    confidence: { type: Type.STRING },
                  },
                  required: ["name", "context", "possible_meanings", "confidence"],
                },
              },
              characters: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    role: { type: Type.STRING },
                    relationship_or_association: { type: Type.STRING },
                  },
                  required: ["name", "role"],
                },
              },
              locations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    significance: { type: Type.STRING },
                  },
                  required: ["name", "significance"],
                },
              },
              emotions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    emotion: { type: Type.STRING },
                    intensity: { type: Type.STRING },
                    context: { type: Type.STRING },
                  },
                  required: ["emotion", "intensity", "context"],
                },
              },
              transformations: stringArray,
              tensions: stringArray,
              alternative_readings: stringArray,
              reflection_questions: stringArray,
              uncertainty_notes: stringArray,
            },
            required: ["version", "summary", "core_interpretation", "themes", "symbols", "characters", "locations", "emotions", "transformations", "tensions", "alternative_readings", "reflection_questions", "uncertainty_notes"],
          },
          feature_json: {
            type: Type.OBJECT,
            properties: {
              version: { type: Type.NUMBER },
              themes: stringArray,
              symbols: stringArray,
              characters: stringArray,
              locations: stringArray,
              emotions: stringArray,
              transformations: stringArray,
              objects: stringArray,
              actions: stringArray,
            },
            required: ["version", "themes", "symbols", "characters", "locations", "emotions", "transformations", "objects", "actions"],
          },
          sun_sign: { type: Type.STRING },
          moon_sign: { type: Type.STRING },
          mercury_sign: { type: Type.STRING },
          venus_sign: { type: Type.STRING },
          mars_sign: { type: Type.STRING },
          jupiter_sign: { type: Type.STRING },
          saturn_sign: { type: Type.STRING },
          uranus_sign: { type: Type.STRING },
          neptune_sign: { type: Type.STRING },
          pluto_sign: { type: Type.STRING },
          moon_phase: { type: Type.STRING },
          day_number: { type: Type.NUMBER },
          planetary_influences: {
            type: Type.OBJECT,
            properties: {
              sun: { type: Type.STRING },
              moon: { type: Type.STRING },
              mercury: { type: Type.STRING },
              venus: { type: Type.STRING },
              mars: { type: Type.STRING },
              jupiter: { type: Type.STRING },
              saturn: { type: Type.STRING },
              uranus: { type: Type.STRING },
              neptune: { type: Type.STRING },
              pluto: { type: Type.STRING },
            },
            required: ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"],
          },
          tags: stringArray,
        },
        required: ["interpretation", "analysis_json", "feature_json", "sun_sign", "moon_sign", "mercury_sign", "venus_sign", "mars_sign", "jupiter_sign", "saturn_sign", "uranus_sign", "neptune_sign", "pluto_sign", "moon_phase", "day_number", "planetary_influences", "tags"],
      },
    },
  });

  const parsed = parseJson(response.text) as DreamInterpretationV2;
  parsed.analysis_json.version = 1;
  parsed.feature_json.version = 1;
  return parsed;
}
