import { GoogleGenAI, Type } from "@google/genai";
import type { InsightEvidence } from "./insightEvidence.js";

function getAi() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured on the server");
  return new GoogleGenAI({ apiKey });
}

function parseJson(text: string) {
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

export async function interpretInsightEvidence(evidence: InsightEvidence) {
  const response = await getAi().models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `You are the interpretive layer for a longitudinal dream journal. The evidence below has already been computed deterministically from saved dream metadata. Do not recalculate counts and do not invent observations.

Your task:
- Return 4-7 concise, useful longitudinal insights.
- Each insight must begin from an explicit fact in the evidence (count, share, association, coverage, or date range), then offer a careful interpretation.
- Prefer personal-pattern language such as "In this journal..." rather than universal dream-symbol claims.
- Treat associations as descriptive, not causal.
- If total_dreams < 8, emphasize that the sample is preliminary and avoid strong claims.
- If an association has a lift, explain it only when joint_count >= 2 and state the joint count.
- Never imply an astrology relationship is degree-exact: current aspect evidence is sign-based only.
- Mention missing-data coverage when it materially limits a conclusion.
- Do not mention a pattern that is not explicitly represented in the evidence.
- Avoid filler, mystical certainty, diagnosis, or claims about hidden facts.

Return a JSON array of strings only.

Evidence: ${JSON.stringify(evidence)}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
    },
  });

  return parseJson(response.text) as string[];
}
