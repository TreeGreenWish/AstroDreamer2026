import { GoogleGenAI, Type } from "@google/genai";
import type { Dream, DreamAstrologyV1, DreamRevisit, PersonalContextFact, UserProfile } from "../types.js";

function getAi() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured on the server");
  return new GoogleGenAI({ apiKey });
}

function parseJson(text: string) {
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

const stringArray = { type: Type.ARRAY, items: { type: Type.STRING } } as const;

export type RevisitResult = Omit<DreamRevisit, "id" | "created_at" | "note_count">;

/**
 * Revisit an existing interpretation using later waking-life notes.
 * This is deliberately a delta analysis: the original interpretation is never replaced.
 */
export async function revisitDreamWithContext(
  dream: Dream,
  userProfile: UserProfile,
  astrology: DreamAstrologyV1
): Promise<RevisitResult> {
  if (!dream.interpretation) throw new Error("An existing interpretation is required before revisiting a dream");
  if (!(dream.notes || []).length) throw new Error("Add a personal note before revisiting this dream");

  const response = await getAi().models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `You are AstraDream's longitudinal dream-analysis layer. The user recorded waking-life notes after receiving an earlier dream interpretation. Revisit the interpretation only where the new personal context materially changes, strengthens, weakens, or clarifies the earlier reading.

Original dream:
${JSON.stringify({ title: dream.title, content: dream.content, date: dream.date, time: dream.time, location_name: dream.location_name })}

Original structured analysis:
${JSON.stringify(dream.analysis_json || null)}

Original interpretation:
${dream.interpretation}

Personal notes added by the user:
${JSON.stringify(dream.notes || [])}

Previously learned personal context:
${JSON.stringify(userProfile.context_memory || [])}

Deterministic dream-moment astrology (facts only):
${JSON.stringify(astrology)}

Rules:
- Treat the user's notes as higher-priority waking-life evidence than symbolic guesses from the original interpretation.
- Preserve useful parts of the original interpretation when the notes do not actually change them.
- Explicitly identify what changed and why. Do not rewrite merely for novelty.
- Never overwrite history: this output is a new interpretive layer, not a replacement for the original.
- Extract reusable context facts from notes conservatively.
- A context fact is "explicit" ONLY when directly stated in the user's note (example: "Leah is my girlfriend" -> subject Leah, predicate relationship, value girlfriend).
- If a relationship or fact is merely suggested, mark it "inferred". Inferred facts will not be promoted to durable profile memory automatically.
- Never infer sensitive traits, diagnoses, sexuality, politics, religion, health conditions, or other private attributes that the note does not directly state.
- The supplied astronomy is computed evidence. Never invent or alter placements, aspects, or retrogrades.
- revised_interpretation should be approximately 180-350 words and focus on the value added by the new context.
- changed_symbols should contain only symbols/characters whose reading materially changed. It is valid for this list to be empty.
- reflection questions should use the new waking-life context and remain open-ended.

Return JSON only.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          context_facts: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                subject: { type: Type.STRING },
                predicate: { type: Type.STRING },
                value: { type: Type.STRING },
                confidence: { type: Type.STRING },
                source_note_timestamp: { type: Type.STRING },
              },
              required: ["subject", "predicate", "value", "confidence"],
            },
          },
          changed_understanding: { type: Type.STRING },
          revised_summary: { type: Type.STRING },
          revised_interpretation: { type: Type.STRING },
          changed_symbols: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                previous_reading: { type: Type.STRING },
                updated_reading: { type: Type.STRING },
                why: { type: Type.STRING },
              },
              required: ["name", "previous_reading", "updated_reading", "why"],
            },
          },
          preserved_points: stringArray,
          reflection_questions: stringArray,
          uncertainty_notes: stringArray,
        },
        required: ["context_facts", "changed_understanding", "revised_summary", "revised_interpretation", "changed_symbols", "preserved_points", "reflection_questions", "uncertainty_notes"],
      },
    },
  });

  const parsed = parseJson(response.text) as RevisitResult;
  parsed.context_facts = (parsed.context_facts || []).map((fact: PersonalContextFact) => ({
    ...fact,
    confidence: fact.confidence === "explicit" ? "explicit" : "inferred",
  }));
  return parsed;
}
