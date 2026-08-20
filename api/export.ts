import type { Request, Response } from "express";
import { createHash } from "node:crypto";
import { dataStore, persistenceProvider } from "../src/server/dataStore.js";

function stableJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const [profile, dreams] = await Promise.all([
      dataStore.getProfile(),
      dataStore.getDreams(),
    ]);

    const payload = {
      profile,
      dreams,
    };

    const checksum = createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex");

    const exportedAt = new Date().toISOString();
    const exportDocument = {
      manifest: {
        format: "astradream-export",
        version: 1,
        exported_at: exportedAt,
        persistence_provider: persistenceProvider,
        dream_count: dreams.length,
        image_count: dreams.filter((dream) => Boolean(dream.image_url)).length,
        checksum_algorithm: "sha256",
        payload_checksum: checksum,
        notes: "Canonical AstraDream backup. Image URLs are preserved in each dream record; binary image bundling will be added in a later export format version.",
      },
      ...payload,
    };

    const filenameDate = exportedAt.slice(0, 10);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="astradream-export-${filenameDate}.json"`,
    );
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(stableJson(exportDocument));
  } catch (error) {
    console.error("Journal export failed", error);
    return res.status(500).json({ error: "Failed to export journal" });
  }
}
