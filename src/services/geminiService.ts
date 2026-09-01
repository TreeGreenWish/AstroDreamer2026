import type { Dream, DreamRevisit, UserProfile } from "../types";

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

function withTimeZone(dream: Dream): Dream {
  return { ...dream, timezone_name: dream.timezone_name || browserTimeZone() };
}

export function generateProfileAnalysis(profile: UserProfile) {
  return postAi<any>("profile-analysis", { profile });
}

export function interpretDream(dream: Dream, userProfile: UserProfile) {
  return postAi<any>("interpret-dream", { dream: withTimeZone(dream), userProfile, action: "interpret" });
}

export function revisitDream(dream: Dream, userProfile: UserProfile) {
  return postAi<{ revisit: DreamRevisit; context_memory_count: number; persisted_dream_id: number; pending: false }>(
    "interpret-dream",
    { dream: withTimeZone(dream), userProfile, action: "revisit" },
  );
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

export async function generateCreativePrompt(dreams: Dream[], insights: string[]) {
  const result = await postAi<{ prompt: string; dreamId: number | null; type: string }>("creative-prompt", { dreams, insights });
  try {
    localStorage.setItem('astradream:latest-creative-prompt', JSON.stringify(result));
    window.dispatchEvent(new CustomEvent('astradream:creative-prompt', { detail: result }));
  } catch {
    // Creative prompt persistence is a convenience; generation should still succeed if storage is unavailable.
  }
  return result;
}
