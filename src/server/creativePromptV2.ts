import { GoogleGenAI, Type } from "@google/genai";
import type { Dream } from "../types.js";

function getAi() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured on the server");
  return new GoogleGenAI({ apiKey });
}

function parseJson(text: string) { return JSON.parse(text.replace(/```json|```/g, "").trim()); }

export async function generateFocusedCreativePrompt(dreams: Dream[], insights: string[]) {
  const summary = dreams.slice(0, 20).map(d => ({ id: d.id, title: d.title, date: d.date, tags: d.tags || [], content: String(d.content || "").slice(0, 900) }));
  const response = await getAi().models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Create ONE inviting creative exercise inspired by the user's dreams. The exercise should deepen ONE motif, image, emotional tension, sensory idea, or conceptual pair rather than combining many symbols.

Good examples of scope and tone:
- "Write a song about telepathy and negative space without naming either directly."
- "Imagine you stumbled onto a pagan rite at an ancient megalith. Write what you sense there."
- "Describe a room where silence behaves like a living thing."

RULES:
- Choose one primary idea. At most pair it with one closely related idea.
- Do not mash together several unrelated dream symbols, settings, mythologies, characters, or plot devices.
- Keep the premise broad enough that the writer must discover the piece themselves.
- Prefer a concrete creative action: write a scene, song, poem, monologue, description, dialogue, list, sketch, or short experiment.
- Do not over-explain the symbolism or tell the user what it means.
- Usually 1-2 sentences and under 45 words.
- It may draw from one dream even if recurring insights exist. Depth is better than coverage.

Insights: ${JSON.stringify(insights)}
Dreams: ${JSON.stringify(summary)}
Return JSON only with prompt, dreamId (number or null), and type ('symbol','anniversary','past_dream','sensory','constraint').`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: { prompt:{type:Type.STRING}, dreamId:{type:Type.NUMBER}, type:{type:Type.STRING} },
        required: ["prompt","type"]
      }
    }
  });
  return parseJson(response.text);
}
