import { dataStore } from "../src/server/dataStore.js";
import { acceptBetaInvite, createBetaInvite, getBetaAccess, isBetaOwner, listBetaInvites, saveBetaFeedback } from "../src/server/betaAccess.js";
import { deleteUserAccount } from "../src/server/accountDeletion.js";
import { claimLegacyArchive, legacyArchiveAvailable } from "../src/server/legacyArchive.js";
import { requireIdentityUser, requirePrivateBetaUser } from "../src/server/requestAuth.js";
import type { UserProfile } from "../src/types.js";

export default async function handler(req: any, res: any) {
  try {
    const authAction = String(req.query?.auth_action || "");

    if (authAction === "status") {
      if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
      const user = await requireIdentityUser(req);
      const access = await getBetaAccess(user);
      return res.status(200).json({
        authenticated: true,
        profile_exists: access.profileExists,
        invited: access.invited,
        invite_accepted: access.inviteAccepted,
        is_owner: await isBetaOwner(user.id),
        legacy_archive_available: await legacyArchiveAvailable(),
      });
    }

    if (authAction === "claim-legacy") {
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
      const user = await requireIdentityUser(req);
      const claimCode = String(req.body?.claim_code || "").trim();
      return res.status(200).json(await claimLegacyArchive(user.id, claimCode));
    }

    if (authAction === "feedback") {
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
      const user = await requirePrivateBetaUser(req);
      await saveBetaFeedback(user.id, String(req.body?.category || "general"), String(req.body?.message || ""), String(req.body?.page || ""));
      return res.status(201).json({ success: true });
    }

    if (authAction === "invite") {
      const user = await requirePrivateBetaUser(req);
      if (req.method === "GET") return res.status(200).json(await listBetaInvites(user.id));
      if (req.method === "POST") return res.status(201).json(await createBetaInvite(user.id, String(req.body?.email || "")));
      return res.status(405).json({ error: "Method not allowed" });
    }

    if (authAction === "delete-account") {
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
      const user = await requirePrivateBetaUser(req);
      if (String(req.body?.confirmation || "") !== "DELETE") return res.status(400).json({ error: "Type DELETE to confirm permanent account deletion" });
      await deleteUserAccount(user.id);
      return res.status(200).json({ success: true });
    }

    const user = await requirePrivateBetaUser(req);
    if (req.method === "GET") return res.status(200).json(await dataStore.getProfile(user.id));
    if (req.method === "POST") {
      const existing = await dataStore.getProfile(user.id);
      if (!existing) await acceptBetaInvite(user);
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
