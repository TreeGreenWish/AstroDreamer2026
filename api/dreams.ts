import { dataStore } from "../src/server/dataStore.js";
import type { Dream } from "../src/types.js";

function sameDream(a: Dream, b: Dream) {
  return a.title === b.title &&
    a.content === b.content &&
    a.date === b.date &&
    a.time === b.time &&
    a.location_name === b.location_name;
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method === "GET") {
      return res.status(200).json(await dataStore.getDreams());
    }

    if (req.method === "POST") {
      const dream = req.body as Dream;
      const existing = (await dataStore.getDreams()).find((item) => sameDream(item, dream));

      // If interpret-dream already created the raw row, enrich that exact row.
      const saved = existing?.id
        ? await dataStore.updateDream(existing.id, { ...existing, ...dream, id: existing.id })
        : await dataStore.createDream(dream);

      return res.status(existing ? 200 : 201).json(saved);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Dream API failed", error);
    const message = error instanceof Error ? error.message : "Dream API failed";
    return res.status(500).json({ error: message });
  }
}
