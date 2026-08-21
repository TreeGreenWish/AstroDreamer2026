import { dataStore } from "../src/server/dataStore.js";
import { claimLegacyArchive, legacyArchiveAvailable } from "../src/server/legacyArchive.js";
import { requireAuthenticatedUser } from "../src/server/requestAuth.js";
import type { UserProfile } from "../src/types.js";

export default async function handler(req: any, res: any) {
  try {
    const user = await requireAuthenticatedUser(req);
    const authAction = String(req.query?.auth_action || "");

    if (authAction === "status") {
      if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
      const profile = await dataStore.getProfile(user.id);
      return res.status(200).json({
        authenticated: true,
        profile_exists: Boolean(profile),
        legacy_archive_available: await legacyArchiveAvailable(),
      });
    }

    if (authAction === "claim-legacy") {
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
      const claimCode = String(req.body?.claim_code || "").trim();
      return res.status(200).json(await claimLegacyArchive(user.id, claimCode));
    }

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
