import { dataStore, persistenceProvider } from "../src/server/dataStore.js";
import {
  generateCreativePrompt, generateDreamImage, generateInsights, generateProfileAnalysis,
  getCurrentAstrology, getMonthAstrologyEvents, interpretDream,
} from "../src/server/geminiService.js";
import { claimLegacyArchive, legacyArchiveAvailable } from "../src/server/legacyArchive.js";
import { requireAuthenticatedUser } from "../src/server/requestAuth.js";
import type { Dream, UserProfile } from "../src/types.js";

export const config = { maxDuration: 300 };

function getPathParts(req: any): string[] {
  const rawUrl = String(req.url || "");
  const pathname = rawUrl.split("?")[0] || "";
  return pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
}
function getBody(req: any): any {
  if (!req.body) return {};
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return {}; } }
  return req.body;
}
function sendError(res: any, error: any, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const status = Number(error?.status || 500);
  console.error(fallback, error);
  return res.status(status).json({ error: message || fallback });
}

export default async function handler(req: any, res: any) {
  const parts = getPathParts(req);
  const method = String(req.method || "GET").toUpperCase();
  const body = getBody(req);
  try {
    if (method === "GET" && parts[0] === "health" && parts.length === 1) {
      return res.status(200).json({ ok: true, persistence: persistenceProvider, ai: Boolean(process.env.GEMINI_API_KEY) });
    }

    if (parts[0] === "diagnostics") return res.status(404).json({ error: "Not found" });

    if (parts[0] === "auth" && parts.length === 2) {
      const user = await requireAuthenticatedUser(req);
      if (parts[1] === "status" && method === "GET") {
        const profile = await dataStore.getProfile(user.id);
        return res.status(200).json({ authenticated: true, profile_exists: Boolean(profile), legacy_archive_available: await legacyArchiveAvailable() });
      }
      if (parts[1] === "claim-legacy" && method === "POST") {
        const claimCode = String(body.claim_code || "").trim();
        const result = await claimLegacyArchive(user.id, claimCode);
        return res.status(200).json(result);
      }
      return res.status(405).json({ error: "Method not allowed" });
    }

    const user = await requireAuthenticatedUser(req);

    if (parts[0] === "profile" && parts.length === 1) {
      if (method === "GET") return res.status(200).json(await dataStore.getProfile(user.id));
      if (method === "POST") {
        await dataStore.saveProfile(body as UserProfile, user.id);
        return res.status(200).json({ success: true });
      }
      return res.status(405).json({ error: "Method not allowed" });
    }

    if (parts[0] === "dreams") {
      if (parts.length === 1) {
        if (method === "GET") return res.status(200).json(await dataStore.getDreams(user.id));
        if (method === "POST") return res.status(201).json(await dataStore.createDream(body as Dream, user.id));
        return res.status(405).json({ error: "Method not allowed" });
      }
      if (parts.length === 2) {
        const id = Number(parts[1]);
        if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid dream id" });
        if (method === "PUT") return res.status(200).json(await dataStore.updateDream(id, body as Dream, user.id));
        if (method === "DELETE") { await dataStore.deleteDream(id, user.id); return res.status(200).json({ success: true }); }
        return res.status(405).json({ error: "Method not allowed" });
      }
    }

    if (parts[0] === "ai" && parts.length === 2) {
      if (method !== "POST") return res.status(405).json({ error: "Method not allowed" });
      switch (parts[1]) {
        case "profile-analysis": return res.status(200).json(await generateProfileAnalysis(body.profile));
        case "interpret-dream": return res.status(200).json(await interpretDream(body.dream, body.userProfile));
        case "current-astrology": return res.status(200).json(await getCurrentAstrology(body.lat, body.lng, body.date, body.time));
        case "month-events": return res.status(200).json(await getMonthAstrologyEvents(body.month, body.year));
        case "dream-image": return res.status(200).json(await generateDreamImage(body.dream));
        case "insights": return res.status(200).json(await generateInsights(body.dreams || []));
        case "creative-prompt": return res.status(200).json(await generateCreativePrompt(body.dreams || [], body.insights || []));
        default: return res.status(404).json({ error: "Unknown AI action" });
      }
    }

    return res.status(404).json({ error: "Not found" });
  } catch (error) {
    return sendError(res, error, "API request failed");
  }
}
