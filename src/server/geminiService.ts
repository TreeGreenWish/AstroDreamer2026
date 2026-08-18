import { GoogleGenAI, Type } from "@google/genai";
import type { Dream, UserProfile } from "../types";

function getAi() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured on the server");
  return new GoogleGenAI({ apiKey });
}

function parseJson(text: string) {
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

export async function generateProfileAnalysis(profile: UserProfile) {
  const response = await getAi().models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Act as an expert astrologer and numerologist. Analyze this birth data: ${JSON.stringify(profile)}. Calculate Life Path, Chinese Zodiac, Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto and Rising sign, plus a concise birth-chart interpretation. Return JSON only.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          life_path: { type: Type.NUMBER }, chinese_zodiac: { type: Type.STRING }, birth_chart_interpretation: { type: Type.STRING },
          sun_sign: { type: Type.STRING }, moon_sign: { type: Type.STRING }, mercury_sign: { type: Type.STRING }, venus_sign: { type: Type.STRING },
          mars_sign: { type: Type.STRING }, jupiter_sign: { type: Type.STRING }, saturn_sign: { type: Type.STRING }, uranus_sign: { type: Type.STRING },
          neptune_sign: { type: Type.STRING }, pluto_sign: { type: Type.STRING }, rising_sign: { type: Type.STRING }
        },
        required: ["life_path","chinese_zodiac","birth_chart_interpretation","sun_sign","moon_sign","mercury_sign","venus_sign","mars_sign","jupiter_sign","saturn_sign","uranus_sign","neptune_sign","pluto_sign","rising_sign"]
      }
    }
  });
  return parseJson(response.text);
}

export async function interpretDream(dream: Dream, userProfile: UserProfile) {
  const response = await getAi().models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Act as a careful dream interpreter and astrologer. User chart: ${userProfile.birth_chart_interpretation || ""}. Dream: ${JSON.stringify(dream)}. Return JSON with a holistic interpretation, zodiac signs for Sun through Pluto at the dream moment, moon phase, numerological day number, 1-2 sentence influence for each planet, and extracted dream symbols/tags.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          interpretation: { type: Type.STRING }, sun_sign: { type: Type.STRING }, moon_sign: { type: Type.STRING }, mercury_sign: { type: Type.STRING },
          venus_sign: { type: Type.STRING }, mars_sign: { type: Type.STRING }, jupiter_sign: { type: Type.STRING }, saturn_sign: { type: Type.STRING },
          uranus_sign: { type: Type.STRING }, neptune_sign: { type: Type.STRING }, pluto_sign: { type: Type.STRING }, moon_phase: { type: Type.STRING },
          day_number: { type: Type.NUMBER },
          planetary_influences: { type: Type.OBJECT, properties: {
            sun: { type: Type.STRING }, moon: { type: Type.STRING }, mercury: { type: Type.STRING }, venus: { type: Type.STRING }, mars: { type: Type.STRING },
            jupiter: { type: Type.STRING }, saturn: { type: Type.STRING }, uranus: { type: Type.STRING }, neptune: { type: Type.STRING }, pluto: { type: Type.STRING }
          }, required: ["sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto"] },
          tags: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["interpretation","sun_sign","moon_sign","mercury_sign","venus_sign","mars_sign","jupiter_sign","saturn_sign","uranus_sign","neptune_sign","pluto_sign","moon_phase","day_number","planetary_influences","tags"]
      }
    }
  });
  return parseJson(response.text);
}

export async function getCurrentAstrology(lat: number, lng: number, date: string, time: string) {
  const response = await getAi().models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Return the astrological state for ${date} ${time} at latitude ${lat}, longitude ${lng}: Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto zodiac signs and moon phase. JSON only.`,
    config: { responseMimeType: "application/json", responseSchema: {
      type: Type.OBJECT,
      properties: { sun_sign:{type:Type.STRING}, moon_sign:{type:Type.STRING}, mercury_sign:{type:Type.STRING}, venus_sign:{type:Type.STRING}, mars_sign:{type:Type.STRING}, jupiter_sign:{type:Type.STRING}, saturn_sign:{type:Type.STRING}, uranus_sign:{type:Type.STRING}, neptune_sign:{type:Type.STRING}, pluto_sign:{type:Type.STRING}, moon_phase:{type:Type.STRING} },
      required:["sun_sign","moon_sign","mercury_sign","venus_sign","mars_sign","jupiter_sign","saturn_sign","uranus_sign","neptune_sign","pluto_sign","moon_phase"]
    }}
  });
  return parseJson(response.text);
}

export async function getMonthAstrologyEvents(month: string, year: string) {
  const response = await getAi().models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `List significant astrological events for ${month} ${year}: moon phases, planetary ingresses, major aspects and retrograde stations. Return JSON array with date YYYY-MM-DD, event, description.`,
    config: { responseMimeType: "application/json", responseSchema: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { date:{type:Type.STRING}, event:{type:Type.STRING}, description:{type:Type.STRING} }, required:["date","event","description"] } } }
  });
  return parseJson(response.text);
}

export async function generateDreamImage(dream: Dream) {
  const response = await getAi().models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: { parts: [{ text: `A mystical, ethereal, surreal digital painting representing this dream: ${dream.title}. ${dream.content}. Dreamy atmospheric cinematic lighting, high detail, celestial elements.` }] }
  });
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
  }
  return null;
}

const PLANETS = ["sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto"] as const;
const SIGNS = ["aries","taurus","gemini","cancer","leo","virgo","libra","scorpio","sagittarius","capricorn","aquarius","pisces"];

type AspectName = "conjunction" | "sextile" | "square" | "trine" | "opposition";

function normalizeSign(value?: string) {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return SIGNS.includes(normalized) ? normalized : null;
}

function signAspect(signA?: string, signB?: string): AspectName | null {
  const a = normalizeSign(signA);
  const b = normalizeSign(signB);
  if (!a || !b) return null;
  const ia = SIGNS.indexOf(a);
  const ib = SIGNS.indexOf(b);
  const raw = Math.abs(ia - ib);
  const distance = Math.min(raw, 12 - raw);
  if (distance === 0) return "conjunction";
  if (distance === 2) return "sextile";
  if (distance === 3) return "square";
  if (distance === 4) return "trine";
  if (distance === 6) return "opposition";
  return null;
}

function deriveSignBasedAspects(dream: Dream) {
  const aspects: Array<{ planet1: string; planet2: string; aspect: AspectName; sign1: string; sign2: string }> = [];
  for (let i = 0; i < PLANETS.length; i++) {
    for (let j = i + 1; j < PLANETS.length; j++) {
      const p1 = PLANETS[i];
      const p2 = PLANETS[j];
      const sign1 = (dream as any)[`${p1}_sign`] as string | undefined;
      const sign2 = (dream as any)[`${p2}_sign`] as string | undefined;
      const aspect = signAspect(sign1, sign2);
      if (aspect && sign1 && sign2) {
        aspects.push({ planet1: p1, planet2: p2, aspect, sign1, sign2 });
      }
    }
  }
  return aspects;
}

export async function generateInsights(dreams: Dream[]) {
  const summary = dreams.map(d => ({
    id: d.id,
    title: d.title,
    date: d.date,
    tags: d.tags || [],
    moon_phase: d.moon_phase,
    day_number: d.day_number,
    planets: Object.fromEntries(PLANETS.map(p => [p, (d as any)[`${p}_sign`] || null])),
    major_aspects: deriveSignBasedAspects(d),
  }));

  const response = await getAi().models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze these dream records for recurring dream themes and astrological/numerological associations.

Use ALL ten planets: Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune, and Pluto.

Also analyze the supplied sign-based major aspects across every planet pair:
- Conjunction: same zodiac sign; blended/unified emphasis.
- Sextile: signs two positions apart; cooperative opportunity/talent.
- Square: signs three positions apart; tension/friction/growth pressure.
- Trine: signs four positions apart; harmony/flow/natural ease.
- Opposition: signs six positions apart; polarity/awareness/balance.

Important limitations:
- The aspect labels supplied here are deterministically derived from zodiac-sign relationships, not exact planetary degrees or orbs. Do not describe them as degree-exact.
- Only claim a recurring pattern when the supplied records actually support it.
- Prefer specific counts (for example "3 of 5 dreams") over vague claims when useful.
- Connect dream symbols/tags with planetary placements, moon phase, day number, and major aspects where evidence exists.
- Do not invent percentages, frequencies, placements, or aspects.

Return 4-7 concise but meaningful insights as a JSON array of strings. Each insight should state the evidence and then offer a careful interpretation.

Dream data: ${JSON.stringify(summary)}`,
    config: { responseMimeType:"application/json", responseSchema:{ type:Type.ARRAY, items:{type:Type.STRING} } }
  });
  return parseJson(response.text);
}

export async function generateCreativePrompt(dreams: Dream[], insights: string[]) {
  const summary = dreams.map(d => ({ id:d.id, title:d.title, date:d.date, tags:d.tags }));
  const response = await getAi().models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Create one mystical creative-writing prompt based on recurring symbols, an anniversary dream if present, or a significant past dream. Insights: ${JSON.stringify(insights)} Dreams: ${JSON.stringify(summary)}. Return JSON with prompt, dreamId (number or null), and type ('symbol','anniversary','past_dream').`,
    config: { responseMimeType:"application/json", responseSchema:{ type:Type.OBJECT, properties:{ prompt:{type:Type.STRING}, dreamId:{type:Type.NUMBER}, type:{type:Type.STRING} }, required:["prompt","type"] } }
  });
  return parseJson(response.text);
}
