import { GoogleGenAI } from "@google/genai";
import type { Dream } from "../types.js";

function getAi() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured on the server");
  return new GoogleGenAI({ apiKey });
}

export async function generateDreamRecallImage(dream: Dream) {
  const prompt = `Create ONE striking, high-quality cinematic dream-journal image as a visual recall anchor for this dream.

Dream title: ${dream.title || "Untitled dream"}
Dream text: ${dream.content || ""}

SELECTION RULES:
- Do NOT illustrate the whole dream and do NOT create a montage, collage, split scene, sequence, or mishmash of symbols.
- Choose exactly ONE memorable visual moment, figure, object, or setting and devote the entire composition to it.
- Prefer a clearly described visual that relates strongly to the dream title. If the title points to a vivid scene or figure, prioritize that.
- If several scenes exist, deliberately ignore the others. Image quality, atmosphere, composition, and memorability matter more than covering every plot point.
- Preserve the chosen scene's emotional tone and distinctive details, but simplify peripheral information.
- Do not depict the dreamer directly unless the dream explicitly describes the dreamer's appearance/form or their visible body is essential to the chosen scene. Prefer POV, absence, silhouette, or environmental framing otherwise.

ABSOLUTE TEXT RULE:
- No words, letters, numbers, labels, captions, subtitles, signs, written dialogue, comic panels, speech bubbles, thought bubbles, typography, watermarks, or legible writing anywhere in the image.

STYLE:
Surreal but coherent, atmospheric, uncanny, painterly-cinematic, sophisticated composition, strong focal point, rich detail where it matters, natural visual hierarchy. One scene only.`;

  const response = await getAi().models.generateContent({
    model: "gemini-3.1-flash-lite-image",
    contents: { parts: [{ text: prompt }] },
    config: {
      responseModalities: ["IMAGE"],
      responseFormat: { image: { aspectRatio: "16:9", imageSize: "1K" } },
    } as any,
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) return `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;
  }
  return null;
}
