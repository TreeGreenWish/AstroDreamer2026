import assert from "node:assert/strict";
import { buildHistoricalDreamContext } from "../src/server/historicalDreamContext.js";
import type { Dream } from "../src/types.js";

const base = { time: null, location_lat: 0, location_lng: 0, location_name: "" };
const corpus: Dream[] = [
  { ...base, id: 1, title: "Flooded house", content: "Water rose through my childhood home.", date: "2026-01-01", tags: ["water"], feature_json: { version: 1, themes: [], symbols: ["water", "house"], characters: [], locations: ["childhood home"], emotions: ["fear"], transformations: [], objects: [], actions: [] } },
  { ...base, id: 2, title: "Dry road", content: "I walked beside a train.", date: "2026-02-01", tags: ["train"] },
];
const current: Dream = { ...base, id: 3, title: "Entering the flood", content: "I entered the water inside the house.", date: "2026-03-01" };
const result = buildHistoricalDreamContext(current, corpus);

assert.equal(result.corpus_size, 2);
assert.equal(result.matched_dreams[0]?.dream_id, 1);
assert.ok(result.matched_dreams[0]?.shared_signals.includes("water"));
assert.deepEqual(result.signal_counts.find(item => item.signal === "water")?.dream_ids, [1]);
assert.ok(!result.matched_dreams.some(item => item.dream_id === 3));
console.log("historical context verification passed");
