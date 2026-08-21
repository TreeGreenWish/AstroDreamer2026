import { dataStore } from "../src/server/dataStore.js";
import { requireAuthenticatedUser } from "../src/server/requestAuth.js";
import type { UserProfile } from "../src/types.js";

export default async function handler(req: any, res: any) {
  try {
    const user = await requireAuthenticatedUser(req);
    if (req.method === "GET") return res.status(200).json(await dataStore.getProfile(user.id));
    if (req.method === "POST") {
      await dataStore.saveProfile(req.body as UserProfile, user.id);
      return res.status(200).json({ success: true });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error: any) {
    console.error("Profile endpoint failed", error);
    const status = Number(error?.status || 500);
    return res.status(status).json({ error: error instanceof Error ? error.message : "Profile endpoint failed" });
  }
}
