import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

import { dataStore, persistenceProvider } from "./src/server/dataStore";
import {
  generateCreativePrompt,
  generateDreamImage,
  generateInsights,
  generateProfileAnalysis,
  getCurrentAstrology,
  getMonthAstrologyEvents,
  interpretDream,
} from "./src/server/geminiService";
import type { Dream, UserProfile } from "./src/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json({ limit: "15mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, persistence: persistenceProvider, ai: Boolean(process.env.GEMINI_API_KEY) });
  });

  app.get("/api/profile", async (_req, res) => {
    try {
      res.json(await dataStore.getProfile());
    } catch (error) {
      console.error("Failed to fetch profile:", error);
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  app.post("/api/profile", async (req, res) => {
    try {
      await dataStore.saveProfile(req.body as UserProfile);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to save profile:", error);
      res.status(500).json({ error: "Failed to save profile" });
    }
  });

  app.get("/api/dreams", async (_req, res) => {
    try {
      res.json(await dataStore.getDreams());
    } catch (error) {
      console.error("Failed to fetch dreams:", error);
      res.status(500).json({ error: "Failed to fetch dreams" });
    }
  });

  app.post("/api/dreams", async (req, res) => {
    try {
      const dream = await dataStore.createDream(req.body as Dream);
      res.status(201).json(dream);
    } catch (error) {
      console.error("Failed to save dream:", error);
      res.status(500).json({ error: "Failed to save dream" });
    }
  });

  app.put("/api/dreams/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid dream id" });
      res.json(await dataStore.updateDream(id, req.body as Dream));
    } catch (error) {
      console.error("Failed to update dream:", error);
      res.status(500).json({ error: "Failed to update dream" });
    }
  });

  app.delete("/api/dreams/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid dream id" });
      await dataStore.deleteDream(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete dream:", error);
      res.status(500).json({ error: "Failed to delete dream" });
    }
  });

  app.post("/api/ai/:action", async (req, res) => {
    try {
      const { action } = req.params;
      let result: unknown;

      switch (action) {
        case "profile-analysis":
          result = await generateProfileAnalysis(req.body.profile);
          break;
        case "interpret-dream":
          result = await interpretDream(req.body.dream, req.body.userProfile);
          break;
        case "current-astrology":
          result = await getCurrentAstrology(req.body.lat, req.body.lng, req.body.date, req.body.time);
          break;
        case "month-events":
          result = await getMonthAstrologyEvents(req.body.month, req.body.year);
          break;
        case "dream-image":
          result = await generateDreamImage(req.body.dream);
          break;
        case "insights":
          result = await generateInsights(req.body.dreams || []);
          break;
        case "creative-prompt":
          result = await generateCreativePrompt(req.body.dreams || [], req.body.insights || []);
          break;
        default:
          return res.status(404).json({ error: "Unknown AI action" });
      }

      res.json(result);
    } catch (error) {
      console.error("AI request failed:", error);
      res.status(500).json({ error: "AI request failed" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "dist", "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`AstraDream running on http://localhost:${PORT} using ${persistenceProvider} persistence`);
  });
}

startServer();
