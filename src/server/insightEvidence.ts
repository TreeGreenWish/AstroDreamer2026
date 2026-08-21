import type { Dream } from "../types.js";

export const PLANETS = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"] as const;
const SIGNS = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"] as const;
const ASPECTS = ["conjunction", "sextile", "square", "trine", "opposition"] as const;

type Planet = typeof PLANETS[number];
type AspectName = typeof ASPECTS[number];

type Count = { value: string; count: number; share: number };
type Association = {
  tag: string;
  factor_type: "planet_sign" | "moon_phase" | "day_number" | "aspect";
  factor: string;
  joint_count: number;
  tag_count: number;
  factor_count: number;
  total_dreams: number;
  joint_share_of_tag: number;
  baseline_share: number;
  lift: number | null;
};

export type InsightEvidence = {
  version: 1;
  generated_from: "deterministic_dream_metadata";
  total_dreams: number;
  date_range: { first: string | null; last: string | null };
  coverage: {
    tagged_dreams: number;
    astrology_enriched_dreams: number;
    moon_phase_dreams: number;
    day_number_dreams: number;
  };
  top_tags: Count[];
  moon_phases: Count[];
  day_numbers: Array<{ value: number; count: number; share: number }>;
  planet_signs: Record<Planet, Count[]>;
  sign_based_aspects: Array<{
    aspect: AspectName;
    planet1: Planet;
    planet2: Planet;
    sign1: string;
    sign2: string;
    count: number;
    share: number;
  }>;
  associations: Association[];
  limitations: string[];
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function round(value: number, places = 3) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function normalizeSign(value: unknown) {
  const normalized = clean(value);
  return (SIGNS as readonly string[]).includes(normalized) ? normalized : null;
}

function normalizeTag(value: unknown) {
  return clean(value).replace(/\s+/g, " ");
}

function aspectFor(signA: string, signB: string): AspectName | null {
  const a = SIGNS.indexOf(signA as any);
  const b = SIGNS.indexOf(signB as any);
  if (a < 0 || b < 0) return null;
  const raw = Math.abs(a - b);
  const distance = Math.min(raw, 12 - raw);
  if (distance === 0) return "conjunction";
  if (distance === 2) return "sextile";
  if (distance === 3) return "square";
  if (distance === 4) return "trine";
  if (distance === 6) return "opposition";
  return null;
}

function countValues(values: string[], total: number, limit = 12): Count[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count, share: total ? round(count / total) : 0 }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, limit);
}

function dreamTags(dream: Dream) {
  return [...new Set((dream.tags || []).map(normalizeTag).filter(Boolean))];
}

function planetFactors(dream: Dream) {
  const factors: string[] = [];
  for (const planet of PLANETS) {
    const sign = normalizeSign((dream as any)[`${planet}_sign`]);
    if (sign) factors.push(`${planet}:${sign}`);
  }
  return factors;
}

function aspectFactors(dream: Dream) {
  const factors: Array<{ key: string; aspect: AspectName; planet1: Planet; planet2: Planet; sign1: string; sign2: string }> = [];
  for (let i = 0; i < PLANETS.length; i += 1) {
    for (let j = i + 1; j < PLANETS.length; j += 1) {
      const planet1 = PLANETS[i];
      const planet2 = PLANETS[j];
      const sign1 = normalizeSign((dream as any)[`${planet1}_sign`]);
      const sign2 = normalizeSign((dream as any)[`${planet2}_sign`]);
      if (!sign1 || !sign2) continue;
      const aspect = aspectFor(sign1, sign2);
      if (!aspect) continue;
      factors.push({
        key: `${planet1}-${aspect}-${planet2}:${sign1}/${sign2}`,
        aspect,
        planet1,
        planet2,
        sign1,
        sign2,
      });
    }
  }
  return factors;
}

export function buildInsightEvidence(dreams: Dream[]): InsightEvidence {
  const usable = dreams.filter(d => d && typeof d === "object");
  const total = usable.length;
  const dates = usable.map(d => d.date).filter(Boolean).sort();
  const taggedDreams = usable.filter(d => dreamTags(d).length > 0).length;
  const astrologyDreams = usable.filter(d => planetFactors(d).length > 0).length;
  const moonDreams = usable.filter(d => Boolean(clean(d.moon_phase))).length;
  const dayDreams = usable.filter(d => Number.isFinite(Number(d.day_number))).length;

  const allTags = usable.flatMap(dreamTags);
  const allMoonPhases = usable.map(d => clean(d.moon_phase)).filter(Boolean);
  const dayCounts = new Map<number, number>();
  for (const dream of usable) {
    const value = Number(dream.day_number);
    if (Number.isFinite(value)) dayCounts.set(value, (dayCounts.get(value) || 0) + 1);
  }

  const planetSigns = Object.fromEntries(PLANETS.map(planet => {
    const values = usable
      .map(d => normalizeSign((d as any)[`${planet}_sign`]))
      .filter((value): value is string => Boolean(value));
    return [planet, countValues(values, values.length, 12)];
  })) as Record<Planet, Count[]>;

  const aspectCounts = new Map<string, { aspect: AspectName; planet1: Planet; planet2: Planet; sign1: string; sign2: string; count: number }>();
  for (const dream of usable) {
    for (const factor of aspectFactors(dream)) {
      const previous = aspectCounts.get(factor.key);
      aspectCounts.set(factor.key, previous ? { ...previous, count: previous.count + 1 } : { ...factor, count: 1 });
    }
  }

  const factorCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  const jointCounts = new Map<string, number>();
  const factorType = new Map<string, Association["factor_type"]>();

  for (const dream of usable) {
    const tags = dreamTags(dream);
    for (const tag of tags) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);

    const factors: string[] = [];
    for (const value of planetFactors(dream)) {
      const key = `planet_sign|${value}`;
      factors.push(key);
      factorType.set(key, "planet_sign");
    }
    const moon = clean(dream.moon_phase);
    if (moon) {
      const key = `moon_phase|${moon}`;
      factors.push(key);
      factorType.set(key, "moon_phase");
    }
    const day = Number(dream.day_number);
    if (Number.isFinite(day)) {
      const key = `day_number|${day}`;
      factors.push(key);
      factorType.set(key, "day_number");
    }
    for (const aspect of aspectFactors(dream)) {
      const value = `${aspect.planet1}-${aspect.aspect}-${aspect.planet2}`;
      const key = `aspect|${value}`;
      factors.push(key);
      factorType.set(key, "aspect");
    }

    for (const factor of new Set(factors)) {
      factorCounts.set(factor, (factorCounts.get(factor) || 0) + 1);
      for (const tag of tags) {
        const key = `${tag}|||${factor}`;
        jointCounts.set(key, (jointCounts.get(key) || 0) + 1);
      }
    }
  }

  const associations: Association[] = [];
  for (const [jointKey, jointCount] of jointCounts) {
    const [tag, factorKey] = jointKey.split("|||");
    const tagCount = tagCounts.get(tag) || 0;
    const factorCount = factorCounts.get(factorKey) || 0;
    if (jointCount < 2 || tagCount < 2 || factorCount < 2) continue;
    const [_, factor] = factorKey.split("|", 2);
    const jointShare = jointCount / tagCount;
    const baselineShare = total ? factorCount / total : 0;
    const lift = baselineShare > 0 ? jointShare / baselineShare : null;
    associations.push({
      tag,
      factor_type: factorType.get(factorKey) || "planet_sign",
      factor,
      joint_count: jointCount,
      tag_count: tagCount,
      factor_count: factorCount,
      total_dreams: total,
      joint_share_of_tag: round(jointShare),
      baseline_share: round(baselineShare),
      lift: lift == null ? null : round(lift, 2),
    });
  }

  associations.sort((a, b) =>
    b.joint_count - a.joint_count ||
    (b.lift || 0) - (a.lift || 0) ||
    a.tag.localeCompare(b.tag)
  );

  return {
    version: 1,
    generated_from: "deterministic_dream_metadata",
    total_dreams: total,
    date_range: { first: dates[0] || null, last: dates[dates.length - 1] || null },
    coverage: {
      tagged_dreams: taggedDreams,
      astrology_enriched_dreams: astrologyDreams,
      moon_phase_dreams: moonDreams,
      day_number_dreams: dayDreams,
    },
    top_tags: countValues(allTags, total, 20),
    moon_phases: countValues(allMoonPhases, moonDreams, 12),
    day_numbers: [...dayCounts.entries()]
      .map(([value, count]) => ({ value, count, share: dayDreams ? round(count / dayDreams) : 0 }))
      .sort((a, b) => b.count - a.count || a.value - b.value),
    planet_signs: planetSigns,
    sign_based_aspects: [...aspectCounts.values()]
      .map(item => ({ ...item, share: astrologyDreams ? round(item.count / astrologyDreams) : 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 30),
    associations: associations.slice(0, 30),
    limitations: [
      "Associations are descriptive, not causal.",
      "Small samples can produce unstable lifts; evidence with fewer than two joint observations is excluded.",
      "Current aspects are sign-based relationships, not exact degree/orb calculations.",
      "Only already-enriched dream metadata is analyzed; missing astrology or tags reduce coverage.",
    ],
  };
}
