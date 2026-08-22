import { dataStore } from "../src/server/dataStore.js";
import { requirePrivateBetaUser } from "../src/server/requestAuth.js";
import type { Dream } from "../src/types.js";

function normalizeTime(value?: string) { return (value || "").slice(0, 5); }
function sameDream(a: Dream, b: Dream) {
  return a.title === b.title && a.content === b.content && a.date === b.date && normalizeTime(a.time) === normalizeTime(b.time) && a.location_name === b.location_name;
}

export default async function handler(req: any, res: any) {
  try {
    const user = await requirePrivateBetaUser(req);
    if (req.method === "GET") return res.status(200).json(await dataStore.getDreams(user.id));
    if (req.method === "POST") {
      const dream = req.body as Dream;
      const existing = (await dataStore.getDreams(user.id)).find(item => sameDream(item, dream));
      const saved = existing?.id
        ? await dataStore.updateDream(existing.id, { ...existing, ...dream, id: existing.id }, user.id)
        : await dataStore.createDream(dream, user.id);
      return res.status(existing ? 200 : 201).json(saved);
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error: any) {
    console.error("Dream API failed", error);
    const status = Number(error?.status || 500);
    return res.status(status).json({ error: error instanceof Error ? error.message : "Dream API failed" });
  }
}
