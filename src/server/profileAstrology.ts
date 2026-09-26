import { createHash } from "node:crypto";
import { GoogleGenAI, Type } from "@google/genai";
import { meterEstimatedCall } from "./aiUsage.js";
import { deterministicDreamAstrology } from "./deterministicAstrology.js";
import type { UserProfile } from "../types.js";

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "") || "https://wgtagrrvnieuzheggsis.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MODEL = "gemini-3-flash-preview";

function headers(extra: Record<string, string> = {}) {
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json", ...extra };
}

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers: { ...headers(), ...(init.headers || {}) } });
  if (!response.ok) throw new Error(`Profile astrology cache request failed (${response.status}): ${await response.text()}`);
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return text ? JSON.parse(text) : (undefined as T);
}

function getAi() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured on the server");
  return new GoogleGenAI({ apiKey });
}

function parseJson(text: string) { return JSON.parse(text.replace(/```json|```/g, "").trim()); }

const placementKeys = ["sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto","rising"] as const;

function chartShape(profile: UserProfile) {
  return {
    life_path: profile.life_path ?? null,
    chinese_zodiac: profile.chinese_zodiac ?? null,
    ...Object.fromEntries(placementKeys.map(key => [key, (profile as any)[`${key}_sign`] || null])),
  };
}

function chartHash(profile: UserProfile) {
  return createHash("sha256").update(JSON.stringify(chartShape(profile))).digest("hex");
}

async function generateBaseline(userId: string, profile: UserProfile) {
  const chart = chartShape(profile);
  return meterEstimatedCall({
    userId,
    operation: "profile_analysis",
    model: MODEL,
    input: { chart, purpose: "cached-placement-baseline" },
    metadata: { profile_astrology: "baseline" },
    execute: async () => {
      const response = await getAi().models.generateContent({
        model: MODEL,
        contents: `Explain this person's natal placements as a stable baseline reference. Be grounded, psychologically useful, non-fatalistic, and concise. For each placement explain what that planet/angle represents, how the sign colors it, strengths, tensions, and one practical reflection question. Do not make daily predictions. Chart: ${JSON.stringify(chart)}. Return JSON only.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              placements: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
                key: { type: Type.STRING }, label: { type: Type.STRING }, meaning: { type: Type.STRING }, reflection: { type: Type.STRING }
              }, required: ["key","label","meaning","reflection"] } },
              synthesis: { type: Type.STRING }
            },
            required: ["placements","synthesis"]
          }
        }
      });
      return parseJson(response.text);
    },
  });
}

async function generateDaily(userId: string, profile: UserProfile, date: string, timezone: string, baseline: any) {
  const today = deterministicDreamAstrology(date, "12:00", timezone, true);
  const chart = chartShape(profile);
  const dailyText = await meterEstimatedCall({
    userId,
    operation: "current_astrology",
    model: MODEL,
    input: { date, timezone, chart, today, purpose: "personal-daily-guidance" },
    metadata: { profile_astrology: "daily", date },
    execute: async () => {
      const response = await getAi().models.generateContent({
        model: MODEL,
        contents: `Write a practical daily horoscope for this individual. Base it on today's deterministic geocentric planetary positions and major aspects, today's numerological day number, and the person's natal sign placements, Chinese zodiac, and Life Path. Avoid certainty, fear, health/financial predictions, or pretending that sign-only natal data gives degree-exact transits. Focus on useful themes, tensions, opportunities, and creative/self-reflective direction for today. Natal baseline: ${JSON.stringify(baseline)}. User: ${JSON.stringify(chart)}. Today: ${JSON.stringify(today)}. Return JSON only.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headline: { type: Type.STRING },
              horoscope: { type: Type.STRING },
              numerology: { type: Type.STRING },
              focus: { type: Type.STRING }
            },
            required: ["headline","horoscope","numerology","focus"]
          }
        }
      });
      return parseJson(response.text);
    },
  });
  return { ...dailyText, day_number: today.day_number, moon_phase: today.moon_phase, source: today.source };
}

type CacheRow = { chart_hash: string; baseline: any; daily_date?: string | null; daily?: any };

export async function getProfileAstrology(userId: string, profile: UserProfile, date: string, timezone: string) {
  const hash = chartHash(profile);
  const rows = await rest<CacheRow[]>(`profile_astrology_cache?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`);
  let baseline = rows[0]?.chart_hash === hash ? rows[0]?.baseline : null;
  let daily = rows[0]?.chart_hash === hash && rows[0]?.daily_date === date ? rows[0]?.daily : null;

  if (!baseline) baseline = await generateBaseline(userId, profile);
  if (!daily) daily = await generateDaily(userId, profile, date, timezone, baseline);

  await rest("profile_astrology_cache?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ user_id: userId, chart_hash: hash, baseline, daily_date: date, daily, updated_at: new Date().toISOString() }),
  });

  return { baseline, daily, date };
}
