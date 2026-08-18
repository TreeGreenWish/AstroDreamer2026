import { dataStore, persistenceProvider } from "../src/server/dataStore";
import {
  generateCreativePrompt,
  generateDreamImage,
  generateInsights,
  generateProfileAnalysis,
  getCurrentAstrology,
  getMonthAstrologyEvents,
  interpretDream,
} from "../src/server/geminiService";
import type { Dream, UserProfile } from "../src/types";

export const config = {
  maxDuration: 300,
};

function getPathParts(req: any): string[] {
  const path = req.query?.path;
  if (Array.isArray(path)) return path.map(String);
  if (typeof path === "string") return path.split("/").filter(Boolean);
  return [];
}

function getBody(req: any): any {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function sendError(res: any, error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  console.error(fallback, error);
  return res.status(500).json({ error: message || fallback });
}

export default async function handler(req: any, res: any) {
  const parts = getPathParts(req);
  const method = String(req.method || "GET").toUpperCase();
  const body = getBody(req);

  try {
    if (method === "GET" && parts[0] === "health" && parts.length === 1) {
      return res.status(200).json({
        ok: true,
        persistence: persistenceProvider,
        ai: Boolean(process.env.GEMINI_API_KEY),
      });
    }

    if (parts[0] === "profile" && parts.length === 1) {
      if (method === "GET") {
        return res.status(200).json(await dataStore.getProfile());
      }
      if (method === "POST") {
        await dataStore.saveProfile(body as UserProfile);
        return res.status(200).json({ success: true });
      }
      return res.status(405).json({ error: "Method not allowed" });
    }

    if (parts[0] === "dreams") {
      if (parts.length === 1) {
        if (method === "GET") {
          return res.status(200).json(await dataStore.getDreams());
        }
        if (method === "POST") {
          const dream = await dataStore.createDream(body as Dream);
          return res.status(201).json(dream);
        }
        return res.status(405).json({ error: "Method not allowed" });
      }

      if (parts.length === 2) {
        const id = Number(parts[1]);
        if (!Number.isInteger(id)) {
          return res.status(400).json({ error: "Invalid dream id" });
        }
        if (method === "PUT") {
          return res.status(200).json(await dataStore.updateDream(id, body as Dream));
        }
        if (method === "DELETE") {
          await dataStore.deleteDream(id);
          return res.status(200).json({ success: true });
        }
        return res.status(405).json({ error: "Method not allowed" });
      }
    }

    if (parts[0] === "ai" && parts.length === 2) {
      if (method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
      }

      switch (parts[1]) {
        case "profile-analysis":
          return res.status(200).json(await generateProfileAnalysis(body.profile));
        case "interpret-dream":
          return res.status(200).json(await interpretDream(body.dream, body.userProfile));
        case "current-astrology":
          return res.status(200).json(
            await getCurrentAstrology(body.lat, body.lng, body.date, body.time),
          );
        case "month-events":
          return res.status(200).json(await getMonthAstrologyEvents(body.month, body.year));
        case "dream-image":
          return res.status(200).json(await generateDreamImage(body.dream));
        case "insights":
          return res.status(200).json(await generateInsights(body.dreams || []));
        case "creative-prompt":
          return res.status(200).json(
            await generateCreativePrompt(body.dreams || [], body.insights || []),
          );
        default:
          return res.status(404).json({ error: "Unknown AI action" });
      }
    }

    return res.status(404).json({ error: "Not found" });
  } catch (error) {
    return sendError(res, error, "API request failed");
  }
}
