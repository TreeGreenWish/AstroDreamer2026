import type { Dream, DreamEntityCandidate, DreamEntityType } from "../types.js";

export function normalizeEntityName(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function addCandidates(
  target: DreamEntityCandidate[],
  entityType: DreamEntityType,
  names: string[],
  details: (name: string) => Partial<Pick<DreamEntityCandidate, "context" | "confidence">> = () => ({}),
) {
  for (const rawName of names || []) {
    const canonicalName = rawName.trim();
    const normalizedName = normalizeEntityName(canonicalName);
    if (!normalizedName) continue;
    const detail = details(rawName);
    target.push({
      entity_type: entityType,
      canonical_name: canonicalName,
      normalized_name: normalizedName,
      surface_form: canonicalName,
      context: detail.context,
      confidence: detail.confidence || "medium",
    });
  }
}

export function extractDreamEntityCandidates(dream: Dream): DreamEntityCandidate[] {
  const feature = dream.feature_json;
  if (!feature) return [];
  const analysis = dream.analysis_json;
  const candidates: DreamEntityCandidate[] = [];

  addCandidates(candidates, "theme", feature.themes);
  addCandidates(candidates, "symbol", feature.symbols, name => {
    const detail = analysis?.symbols.find(item => normalizeEntityName(item.name) === normalizeEntityName(name));
    return { context: detail?.context, confidence: detail?.confidence };
  });
  addCandidates(candidates, "character", feature.characters, name => {
    const detail = analysis?.characters.find(item => normalizeEntityName(item.name) === normalizeEntityName(name));
    return { context: detail ? [detail.role, detail.relationship_or_association].filter(Boolean).join(" — ") : undefined };
  });
  addCandidates(candidates, "place", feature.locations, name => {
    const detail = analysis?.locations.find(item => normalizeEntityName(item.name) === normalizeEntityName(name));
    return { context: detail?.significance };
  });
  addCandidates(candidates, "emotion", feature.emotions, name => {
    const detail = analysis?.emotions.find(item => normalizeEntityName(item.emotion) === normalizeEntityName(name));
    return { context: detail?.context, confidence: detail?.intensity };
  });
  addCandidates(candidates, "transformation", feature.transformations);
  addCandidates(candidates, "object", feature.objects);
  addCandidates(candidates, "action", feature.actions);

  const unique = new Map<string, DreamEntityCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.entity_type}:${candidate.normalized_name}`;
    const previous = unique.get(key);
    if (!previous || (!previous.context && candidate.context)) unique.set(key, candidate);
  }
  return [...unique.values()];
}
