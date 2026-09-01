import { createRequire } from "node:module";
import type * as AstronomyTypes from "astronomy-engine";
import type { AstrologyBodyFact, DreamAstrologyV1 } from "../types.js";

const require = createRequire(import.meta.url);
const Astronomy = require("astronomy-engine") as typeof AstronomyTypes;

const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"] as const;

export type ExactAspectName = "conjunction" | "sextile" | "square" | "trine" | "opposition";

const ASPECT_ANGLES: Array<{ aspect: ExactAspectName; angle: number; maxOrb: number }> = [
  { aspect: "conjunction", angle: 0, maxOrb: 8 },
  { aspect: "sextile", angle: 60, maxOrb: 5 },
  { aspect: "square", angle: 90, maxOrb: 7 },
  { aspect: "trine", angle: 120, maxOrb: 7 },
  { aspect: "opposition", angle: 180, maxOrb: 8 },
];

const EPHEMERIS_BODIES = {
  sun: Astronomy.Body.Sun,
  moon: Astronomy.Body.Moon,
  mercury: Astronomy.Body.Mercury,
  venus: Astronomy.Body.Venus,
  mars: Astronomy.Body.Mars,
  jupiter: Astronomy.Body.Jupiter,
  saturn: Astronomy.Body.Saturn,
  uranus: Astronomy.Body.Uranus,
  neptune: Astronomy.Body.Neptune,
  pluto: Astronomy.Body.Pluto,
} as const;

function mod(value: number, divisor: number) { return ((value % divisor) + divisor) % divisor; }
function round(value: number, places = 3) { const scale = 10 ** places; return Math.round(value * scale) / scale; }

export function normalizeLongitude(longitude: number) { return mod(longitude, 360); }
export function zodiacFromLongitude(longitude: number) {
  const normalized = normalizeLongitude(longitude);
  const signIndex = Math.floor(normalized / 30);
  return { sign: SIGNS[signIndex], degree_in_sign: round(normalized % 30, 4) };
}
export function bodyFact(longitude: number, retrograde: boolean): AstrologyBodyFact {
  const normalized = normalizeLongitude(longitude);
  const zodiac = zodiacFromLongitude(normalized);
  return { longitude: round(normalized, 6), sign: zodiac.sign, degree_in_sign: zodiac.degree_in_sign, retrograde };
}

function partsAt(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)]));
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute, second: parts.second };
}

export function localDreamTimeToUtc(date: string, time: string, timezone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour = 0, minute = 0, second = 0] = time.split(":").map(Number);
  if (![year, month, day, hour, minute, second].every(Number.isFinite)) throw new Error("Invalid dream date/time");
  const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let candidate = new Date(desiredAsUtc);
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
  while (current > 9 && current !== 11 && current !== 22 && current !== 33) current = String(current).split("").reduce((sum, digit) => sum + Number(digit), 0);
  return current;
}
export function numerologicalDayNumber(date: string) {
  const digits = date.replace(/\D/g, "").split("").map(Number);
  if (!digits.length || digits.some(value => !Number.isFinite(value))) throw new Error("Invalid date for numerology");
  return reduceNumerology(digits.reduce((sum, value) => sum + value, 0));
}

function circularDegreeDistance(a: number, b: number) { const raw = Math.abs(a - b); return Math.min(raw, 360 - raw); }
function lunarPhaseLabel(phaseAngle: number) {
  const eventWindowDegrees = 10.8;
  if (circularDegreeDistance(phaseAngle, 0) <= eventWindowDegrees) return "New Moon";
  if (Math.abs(phaseAngle - 90) <= eventWindowDegrees) return "First Quarter";
  if (Math.abs(phaseAngle - 180) <= eventWindowDegrees) return "Full Moon";
  if (Math.abs(phaseAngle - 270) <= eventWindowDegrees) return "Last Quarter";
  if (phaseAngle < 90) return "Waxing Crescent";
  if (phaseAngle < 180) return "Waxing Gibbous";
  if (phaseAngle < 270) return "Waning Gibbous";
  return "Waning Crescent";
}
export function moonPhaseFacts(instant: Date) {
  const phaseAngle = normalizeLongitude(Astronomy.MoonPhase(instant));
  const illumination = (1 - Math.cos(phaseAngle * Math.PI / 180)) / 2;
  return { phase_angle: round(phaseAngle, 6), phase_fraction: round(phaseAngle / 360, 6), moon_phase: lunarPhaseLabel(phaseAngle), moon_illumination: round(illumination, 4) };
}

function apparentGeocentricLongitude(body: AstronomyTypes.Body, instant: Date) {
  if (body === Astronomy.Body.Moon) return normalizeLongitude(Astronomy.EclipticGeoMoon(instant).lon);
  return normalizeLongitude(Astronomy.Ecliptic(Astronomy.GeoVector(body, instant, true)).elon);
}
function signedAngularMotion(fromLongitude: number, toLongitude: number) { return mod(toLongitude - fromLongitude + 180, 360) - 180; }
function isRetrograde(body: AstronomyTypes.Body, instant: Date) {
  if (body === Astronomy.Body.Sun || body === Astronomy.Body.Moon) return false;
  const halfDay = 12 * 60 * 60 * 1000;
  const before = apparentGeocentricLongitude(body, new Date(instant.getTime() - halfDay));
  const after = apparentGeocentricLongitude(body, new Date(instant.getTime() + halfDay));
  return signedAngularMotion(before, after) < 0;
}
export function ephemerisBodies(instant: Date) {
  return Object.fromEntries(Object.entries(EPHEMERIS_BODIES).map(([name, body]) => [name, bodyFact(apparentGeocentricLongitude(body, instant), isRetrograde(body, instant))])) as Record<keyof typeof EPHEMERIS_BODIES, AstrologyBodyFact>;
}

function angularSeparation(a: number, b: number) { const raw = Math.abs(normalizeLongitude(a) - normalizeLongitude(b)); return Math.min(raw, 360 - raw); }
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
        if (orb <= definition.maxOrb && (!best || orb < best.orb)) best = { aspect: definition.aspect, orb };
      }
      if (best) aspects.push({ planet1, planet2, aspect: best.aspect, orb: round(best.orb, 3) });
    }
  }
  return aspects.sort((a, b) => a.orb - b.orb);
}

export function deterministicDreamFacts(date: string, time: string, timezone: string) {
  const instant = localDreamTimeToUtc(date, time, timezone);
  return { instant_utc: instant.toISOString(), day_number: numerologicalDayNumber(date), ...moonPhaseFacts(instant) };
}

function dateOnlyAstrology(date: string, timezone: string): DreamAstrologyV1 & { day_number: number } {
  const start = localDreamTimeToUtc(date, "00:00", timezone);
  const end = localDreamTimeToUtc(date, "23:59", timezone);
  const midpoint = localDreamTimeToUtc(date, "12:00", timezone);
  const startBodies = ephemerisBodies(start);
  const endBodies = ephemerisBodies(end);
  const reliableSigns: Record<string, string> = {};
  const uncertainBodies: string[] = [];
  for (const name of Object.keys(EPHEMERIS_BODIES)) {
    const startSign = startBodies[name as keyof typeof startBodies].sign;
    const endSign = endBodies[name as keyof typeof endBodies].sign;
    if (startSign === endSign) reliableSigns[name] = startSign;
    else uncertainBodies.push(name);
  }
  const startMoon = moonPhaseFacts(start);
  const endMoon = moonPhaseFacts(end);
  const phaseStable = startMoon.moon_phase === endMoon.moon_phase;
  return {
    version: 1,
    source: "astronomy-engine-2.1.19-geocentric-date-only-v1",
    calculated_at: new Date().toISOString(),
    time_precision: "date_only",
    time_known: false,
    bodies: {},
    reliable_signs: reliableSigns,
    uncertain_bodies: uncertainBodies,
    moon_phase: phaseStable ? startMoon.moon_phase : undefined,
    day_number: numerologicalDayNumber(date),
  };
}

export function deterministicDreamAstrology(date: string, time: string | null | undefined, timezone: string, timeKnown = true): DreamAstrologyV1 & { instant_utc?: string; day_number: number; phase_angle?: number } {
  if (!timeKnown || !time) return dateOnlyAstrology(date, timezone);
  const instant = localDreamTimeToUtc(date, time, timezone);
  const moon = moonPhaseFacts(instant);
  const bodies = ephemerisBodies(instant);
  return {
    version: 1,
    source: "astronomy-engine-2.1.19-geocentric-v1",
    calculated_at: new Date().toISOString(),
    time_precision: "exact",
    time_known: true,
    instant_utc: instant.toISOString(),
    day_number: numerologicalDayNumber(date),
    phase_angle: moon.phase_angle,
    moon_phase: moon.moon_phase,
    moon_illumination: moon.moon_illumination,
    bodies,
    reliable_signs: Object.fromEntries(Object.entries(bodies).map(([name, body]) => [name, body.sign])),
    uncertain_bodies: [],
    aspects: exactMajorAspects(bodies),
  };
}
