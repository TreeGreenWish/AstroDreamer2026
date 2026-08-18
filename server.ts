import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

import { dataStore, persistenceProvider } from "./src/server/dataStore";
import type { Dream, UserProfile } from "./src/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json({ limit: "10mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, persistence: persistenceProvider });
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
      if (!Number.isInteger(id)) {
        return res.status(400).json({ error: "Invalid dream id" });
      }

      const dream = await dataStore.updateDream(id, req.body as Dream);
      res.json(dream);
    } catch (error) {
      console.error("Failed to update dream:", error);
      res.status(500).json({ error: "Failed to update dream" });
    }
  });

  app.delete("/api/dreams/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        return res.status(400).json({ error: "Invalid dream id" });
      }

      await dataStore.deleteDream(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete dream:", error);
      res.status(500).json({ error: "Failed to delete dream" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(
      `AstraDream running on http://localhost:${PORT} using ${persistenceProvider} persistence`,
    );
  });
}

startServer();
