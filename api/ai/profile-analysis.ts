import { generateProfileAnalysis } from "../../src/server/geminiService.js";
import { getCached, hashObject, setCached } from "../../src/server/aiCache.js";

export const config = { maxDuration: 300 };

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const profile = req.body?.profile;
    if (!profile) return res.status(400).json({ error: "profile is required" });

    const stableBirthData = {
      dob: profile.dob,
      tob: profile.tob,
      lob_lat: Number(profile.lob_lat).toFixed(4),
      lob_lng: Number(profile.lob_lng).toFixed(4),
      lob_name: profile.lob_name,
    };
    const cacheKey = `profile-analysis:${hashObject(stableBirthData)}`;
    const cached = await getCached<any>(cacheKey);
    if (cached) return res.status(200).json(cached);

    const result = await generateProfileAnalysis(profile);
    await setCached(cacheKey, "profile-analysis", result, null);
    return res.status(200).json(result);
  } catch (error) {
    console.error("Profile analysis failed", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Profile analysis failed" });
  }
}
