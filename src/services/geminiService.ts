import type { Dream, UserProfile } from "../types";

async function postAi<T>(action: string, payload: unknown): Promise<T> {
  const response = await fetch(`/api/ai/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.error || `AI request failed (${response.status})`);
  }

  return response.json();
}

function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

export function generateProfileAnalysis(profile: UserProfile) {
  return postAi<any>("profile-analysis", { profile });
}

export function interpretDream(dream: Dream, userProfile: UserProfile) {
  const dreamWithTimeZone: Dream = {
    ...dream,
    timezone_name: dream.timezone_name || browserTimeZone(),
  };
  return postAi<any>("interpret-dream", { dream: dreamWithTimeZone, userProfile });
}

export function getCurrentAstrology(lat: number, lng: number, date: string, time: string) {
  return postAi<any>("current-astrology", { lat, lng, date, time });
}

export function getMonthAstrologyEvents(month: string, year: string) {
  return postAi<any[]>("month-events", { month, year });
}

export function generateDreamImage(dream: Dream) {
  return postAi<string | null>("dream-image", { dream });
}

export function generateInsights(dreams: Dream[]) {
  return postAi<string[]>("insights", { dreams });
}

export function generateCreativePrompt(dreams: Dream[], insights: string[]) {
  return postAi<{ prompt: string; dreamId: number | null; type: string }>("creative-prompt", { dreams, insights });
}
