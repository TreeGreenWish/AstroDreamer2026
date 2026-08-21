import type { AstrologyBodyFact, DreamAstrologyV1 } from "../types.js";

const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"] as const;
const SYNODIC_MONTH_DAYS = 29.530588853;
const NEW_MOON_EPOCH_MS = Date.UTC(2000, 0, 6, 18, 14, 0);

export type ExactAspectName = "conjunction" | "sextile" | "square" | "trine" | "opposition";

const ASPECT_ANGLES: Array<{ aspect: ExactAspectName; angle: number; maxOrb: number }> = [
  { aspect: "conjunction", angle: 0, maxOrb: 8 },
  { aspect: "sextile", angle: 60, maxOrb: 5 },
  { aspect: "square", angle: 90, maxOrb: 7 },
  { aspect: "trine", angle: 120, maxOrb: 7 },
  { aspect: "opposition", angle: 180, maxOrb: 8 },
];

function mod(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function round(value: number, places = 3) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

export function normalizeLongitude(longitude: number) {
  return mod(longitude, 360);
}

export function zodiacFromLongitude(longitude: number) {
  const normalized = normalizeLongitude(longitude);
  const signIndex = Math.floor(normalized / 30);
  return {
    sign: SIGNS[signIndex],
    degree_in_sign: round(normalized % 30, 4),
  };
}

export function bodyFact(longitude: number, retrograde: boolean): AstrologyBodyFact {
  const normalized = normalizeLongitude(longitude);
  const zodiac = zodiacFromLongitude(normalized);
  return {
    longitude: round(normalized, 6),
    sign: zodiac.sign,
    degree_in_sign: zodiac.degree_in_sign,
    retrograde,
  };
}

function partsAt(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter(part => part.type !== "literal")
      .map(part => [part.type, Number(part.value)])
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

/** Resolve a local wall-clock date/time in an IANA timezone to UTC without a timezone dependency. */
export function localDreamTimeToUtc(date: string, time: string, timezone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour = 0, minute = 0, second = 0] = time.split(":").map(Number);
  if (![year, month, day, hour, minute, second].every(Number.isFinite)) {
    throw new Error("Invalid dream date/time");
  }

  const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let candidate = new Date(desiredAsUtc);

  // Iterating handles ordinary UTC offsets and DST transitions using the runtime's IANA tz database.
  for (let i = 0; i < 4; i += 1) {
    const actual = partsAt(candidate, timezone);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    const delta = desiredAsUtc - actualAsUtc;
    if (Math.abs(delta) < 1000) break;
    candidate = new Date(candidate.getTime() + delta);
  }

  return candidate;
}

function reduceNumerology(value: number) {
  let current = Math.abs(Math.trunc(value));
  while (current > 9 && current !== 11 && current !== 22 && current !== 33) {
    current = String(current).split("").reduce((sum, digit) => sum + Number(digit), 0);
  }
  return current;
}

/** Universal-day style calendar-date numerology, preserving master numbers 11/22/33. */
export function numerologicalDayNumber(date: string) {
  const digits = date.replace(/\D/g, "").split("").map(Number);
  if (!digits.length || digits.some(value => !Number.isFinite(value))) throw new Error("Invalid date for numerology");
  return reduceNumerology(digits.reduce((sum, value) => sum + value, 0));
}

function circularDistance(a: number, b: number) {
  const raw = Math.abs(a - b);
  return Math.min(raw, 1 - raw);
}

function lunarPhaseLabel(phase: number) {
  // Reserve event-like labels for a narrow window around the actual quarter/new/full point.
  const eventWindow = 0.03; // about 21 hours of a synodic month on either side.
  if (circularDistance(phase, 0) <= eventWindow) return "New Moon";
  if (Math.abs(phase - 0.25) <= eventWindow) return "First Quarter";
  if (Math.abs(phase - 0.5) <= eventWindow) return "Full Moon";
  if (Math.abs(phase - 0.75) <= eventWindow) return "Last Quarter";
  if (phase < 0.25) return "Waxing Crescent";
  if (phase < 0.5) return "Waxing Gibbous";
  if (phase < 0.75) return "Waning Gibbous";
  return "Waning Crescent";
}

export function moonPhaseFacts(instant: Date) {
  const elapsedDays = (instant.getTime() - NEW_MOON_EPOCH_MS) / 86_400_000;
  const phase = mod(elapsedDays / SYNODIC_MONTH_DAYS, 1);
  const illumination = (1 - Math.cos(phase * 2 * Math.PI)) / 2;
  return {
    phase_fraction: round(phase, 6),
    moon_phase: lunarPhaseLabel(phase),
    moon_illumination: round(illumination, 4),
  };
}

function angularSeparation(a: number, b: number) {
  const raw = Math.abs(normalizeLongitude(a) - normalizeLongitude(b));
  return Math.min(raw, 360 - raw);
}

export function exactMajorAspects(bodies: Record<string, AstrologyBodyFact>) {
  const entries = Object.entries(bodies);
  const aspects: NonNullable<DreamAstrologyV1["aspects"]> = [];

  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const [planet1, body1] = entries[i];
      const [planet2, body2] = entries[j];
      const separation = angularSeparation(body1.longitude, body2.longitude);
      let best: { aspect: ExactAspectName; orb: number } | null = null;

      for (const definition of ASPECT_ANGLES) {
        const orb = Math.abs(separation - definition.angle);
        if (orb <= definition.maxOrb && (!best || orb < best.orb)) {
          best = { aspect: definition.aspect, orb };
        }
      }

      if (best) {
        aspects.push({ planet1, planet2, aspect: best.aspect, orb: round(best.orb, 3) });
      }
    }
  }

  return aspects.sort((a, b) => a.orb - b.orb);
}

export function deterministicDreamFacts(date: string, time: string, timezone: string) {
  const instant = localDreamTimeToUtc(date, time, timezone);
  return {
    instant_utc: instant.toISOString(),
    day_number: numerologicalDayNumber(date),
    ...moonPhaseFacts(instant),
  };
}
