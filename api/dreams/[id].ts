import { dataStore } from "../../src/server/dataStore.js";
import { requireAuthenticatedUser } from "../../src/server/requestAuth.js";
import type { Dream } from "../../src/types.js";

export default async function handler(req: any, res: any) {
  const id = Number(req.query?.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid dream id" });
  try {
    const user = await requireAuthenticatedUser(req);
    if (req.method === "PUT") return res.status(200).json(await dataStore.updateDream(id, req.body as Dream, user.id));
    if (req.method === "DELETE") {
      await dataStore.deleteDream(id, user.id);
      return res.status(200).json({ success: true });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error: any) {
    console.error("Dream update/delete failed", error);
    const status = Number(error?.status || 500);
    return res.status(status).json({ error: error instanceof Error ? error.message : "Dream update/delete failed" });
  }
}
