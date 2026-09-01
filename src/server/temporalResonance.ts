import { GoogleGenAI, Type } from '@google/genai';
import { deterministicDreamAstrology, numerologicalDayNumber } from './deterministicAstrology.js';
import { getCached, hashObject, setCached } from './aiCache.js';
import type { Dream } from '../types.js';

const PLANETS = ['sun','moon','mercury','venus','mars','jupiter','saturn','uranus','neptune','pluto'] as const;
const ASPECTS = [
  { name: 'conjunction', angle: 0, orb: 6 },
  { name: 'sextile', angle: 60, orb: 4 },
  { name: 'square', angle: 90, orb: 5 },
  { name: 'trine', angle: 120, orb: 5 },
  { name: 'opposition', angle: 180, orb: 6 },
] as const;

type Planet = typeof PLANETS[number];
type Evidence = {
  kind: 'return'|'aspect'|'moon'|'numerology'|'anniversary'|'sign';
  label: string;
  detail: string;
  score: number;
  orb?: number;
};
export type TemporalResonance = {
  dreamId: number;
  score: number;
  strength: 'very_strong'|'strong'|'moderate';
  evidence: Evidence[];
  whyToday: string;
  interpretation?: string | null;
};

function mod(v: number, d: number) { return ((v % d) + d) % d; }
function distance(a: number, b: number) { const raw = Math.abs(mod(a,360)-mod(b,360)); return Math.min(raw,360-raw); }
function titleCase(s: string) { return s.charAt(0).toUpperCase()+s.slice(1); }
function sameMonthDay(a: string, b: string) { return /^\d{4}-\d{2}-\d{2}$/.test(a) && /^\d{4}-\d{2}-\d{2}$/.test(b) && a.slice(5) === b.slice(5) && a.slice(0,4) !== b.slice(0,4); }

function bestAspect(a: number, b: number) {
  const sep = distance(a,b);
  let best: {name: typeof ASPECTS[number]['name']; orb: number}|null = null;
  for (const asp of ASPECTS) {
    const orb = Math.abs(sep-asp.angle);
    if (orb <= asp.orb && (!best || orb < best.orb)) best = { name: asp.name, orb: Number(orb.toFixed(2)) };
  }
  return best;
}

function legacySign(dream: Dream, planet: Planet) {
  return (dream as any)[`${planet}_sign`] as string | undefined;
}

function dreamBody(dream: Dream, planet: Planet) {
  return dream.astrology_json?.bodies?.[planet] || null;
}

function scoreDream(dream: Dream, today: ReturnType<typeof deterministicDreamAstrology>, todayDate: string): TemporalResonance | null {
  if (!dream.id) return null;
  const evidence: Evidence[] = [];
  const todayBodies = today.bodies || {};
  const exactDream = dream.astrology_json?.time_precision === 'exact' && Object.keys(dream.astrology_json?.bodies || {}).length > 0;

  if (exactDream) {
    for (const currentPlanet of PLANETS) {
      const current = todayBodies[currentPlanet];
      if (!current) continue;
      for (const originalPlanet of PLANETS) {
        const original = dreamBody(dream, originalPlanet);
        if (!original) continue;
        const asp = bestAspect(current.longitude, original.longitude);
        if (!asp) continue;
        const samePlanet = currentPlanet === originalPlanet;
        const tightness = Math.max(0, 1 - asp.orb / 6);
        if (samePlanet && asp.name === 'conjunction') {
          const score = Math.round(20 + 16 * tightness);
          evidence.push({ kind:'return', label:`${titleCase(currentPlanet)} return`, detail:`Today's ${titleCase(currentPlanet)} is ${asp.orb.toFixed(1)}° from its position when this dream was recorded.`, score, orb:asp.orb });
        } else {
          const personal = ['sun','moon','mercury','venus','mars'].includes(currentPlanet) || ['sun','moon','mercury','venus','mars'].includes(originalPlanet);
          const base = samePlanet ? 12 : personal ? 9 : 6;
          const score = Math.round(base + 7 * tightness);
          evidence.push({ kind:'aspect', label:`${titleCase(currentPlanet)} ${asp.name} dream ${titleCase(originalPlanet)}`, detail:`Today's ${titleCase(currentPlanet)} forms a ${asp.name} to the dream-night ${titleCase(originalPlanet)} with a ${asp.orb.toFixed(1)}° orb.`, score, orb:asp.orb });
        }
      }
    }
  } else {
    for (const planet of PLANETS) {
      const current = todayBodies[planet];
      const originalSign = dream.astrology_json?.reliable_signs?.[planet] || legacySign(dream, planet);
      if (current?.sign && originalSign && current.sign.toLowerCase() === originalSign.toLowerCase()) {
        evidence.push({ kind:'sign', label:`${titleCase(planet)} sign recurrence`, detail:`Today's ${titleCase(planet)} is again in ${current.sign}, matching the reliable sign recorded for this dream.`, score:4 });
      }
    }
  }

  const dreamPhase = dream.astrology_json?.moon_phase || dream.moon_phase;
  if (dreamPhase && today.moon_phase && dreamPhase.toLowerCase() === today.moon_phase.toLowerCase()) {
    evidence.push({ kind:'moon', label:'Lunar phase recurrence', detail:`Today and the dream share the ${today.moon_phase} phase.`, score:7 });
  }
  const dreamMoonSign = dreamBody(dream,'moon')?.sign || dream.astrology_json?.reliable_signs?.moon || dream.moon_sign;
  if (todayBodies.moon?.sign && dreamMoonSign && todayBodies.moon.sign.toLowerCase() === dreamMoonSign.toLowerCase()) {
    evidence.push({ kind:'moon', label:`Moon in ${todayBodies.moon.sign}`, detail:`The Moon has returned to the same zodiac sign it occupied for this dream.`, score:8 });
  }

  const dreamDay = dream.day_number ?? (dream.astrology_json as any)?.day_number ?? numerologicalDayNumber(dream.date);
  const todayDay = today.day_number;
  if (dreamDay && todayDay && dreamDay === todayDay) {
    evidence.push({ kind:'numerology', label:`Day ${todayDay} ↔ Day ${dreamDay}`, detail:`Today's numerological day number matches the day number of this dream.`, score:12 });
  }
  if (sameMonthDay(dream.date,todayDate)) {
    evidence.push({ kind:'anniversary', label:'Calendar anniversary', detail:`This dream was recorded on this calendar date in a previous year.`, score:8 });
  }

  evidence.sort((a,b)=>b.score-a.score);
  const distinctKinds = new Set(evidence.map(e=>e.kind));
  let score = evidence.reduce((sum,e)=>sum+e.score,0);
  if (distinctKinds.size >= 2) score += 5;
  if (distinctKinds.size >= 3) score += 5;
  score = Math.min(100,score);
  if (score < 18) return null;
  const strength = score >= 55 ? 'very_strong' : score >= 34 ? 'strong' : 'moderate';
  const top = evidence.slice(0,3);
  const whyToday = top.map(e=>e.detail).join(' ');
  return { dreamId:dream.id, score, strength, evidence:top, whyToday };
}

async function addInterpretations(userId: string, date: string, dreams: Dream[], resonances: TemporalResonance[]) {
  if (!resonances.length || !process.env.GEMINI_API_KEY) return resonances;
  const top = resonances.slice(0,3);
  const input = top.map(r => {
    const dream = dreams.find(d=>d.id===r.dreamId);
    return { dreamId:r.dreamId, title:dream?.title, tags:dream?.tags || [], evidence:r.evidence.map(e=>e.detail) };
  });
  const key = `user:${userId}:temporal-resonance:v1:${date}:${hashObject(input)}`;
  const cached = await getCached<Record<string,string>>(key);
  let interpretations = cached;
  if (!interpretations) {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model:'gemini-3-flash-preview',
      contents:`For each dream, write ONE restrained 1-2 sentence reflection explaining why the listed deterministic astrology/numerology recurrence may make today a useful day to reread it. Never invent an aspect, transit, degree, symbol, or causal claim. Treat astrology/numerology as reflective traditions, not proven causation. Data: ${JSON.stringify(input)}. Return an object keyed by dreamId.`,
      config:{ responseMimeType:'application/json', responseSchema:{ type:Type.OBJECT, additionalProperties:{ type:Type.STRING } } as any }
    });
    interpretations = JSON.parse((response.text || '{}').replace(/```json|```/g,'').trim());
    await setCached(key,'temporal-resonance',interpretations,new Date(Date.now()+36*60*60*1000));
  }
  return resonances.map(r=>({ ...r, interpretation: interpretations?.[String(r.dreamId)] || null }));
}

export async function buildTemporalResonance(userId: string, dreams: Dream[], date: string, time: string, timezone: string) {
  const today = deterministicDreamAstrology(date,time,timezone,true);
  const ranked = dreams.map(d=>scoreDream(d,today,date)).filter(Boolean).sort((a,b)=>(b!.score-a!.score)).slice(0,3) as TemporalResonance[];
  return { date, day_number:today.day_number, moon_phase:today.moon_phase, source:today.source, resonances: await addInterpretations(userId,date,dreams,ranked) };
}
