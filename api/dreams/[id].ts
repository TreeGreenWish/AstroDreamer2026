import { dataStore } from "../../src/server/dataStore.js";
import type { Dream } from "../../src/types.js";

export default async function handler(req: any, res: any) {
  const id = Number(req.query?.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid dream id" });

  try {
    if (req.method === "PUT") {
      return res.status(200).json(await dataStore.updateDream(id, req.body as Dream));
    }
    if (req.method === "DELETE") {
      await dataStore.deleteDream(id);
      return res.status(200).json({ success: true });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Dream update/delete failed", error);
    const message = error instanceof Error ? error.message : "Dream update/delete failed";
    return res.status(500).json({ error: message });
  }
}
