import { dataStore } from "../src/server/dataStore.js";
import type { UserProfile } from "../src/types.js";

export default async function handler(req: any, res: any) {
  try {
    if (req.method === "GET") {
      return res.status(200).json(await dataStore.getProfile());
    }
    if (req.method === "POST") {
      await dataStore.saveProfile(req.body as UserProfile);
      return res.status(200).json({ success: true });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Profile endpoint failed", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Profile endpoint failed" });
  }
}
