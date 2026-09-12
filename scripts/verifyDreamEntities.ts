import assert from "node:assert/strict";
import { extractDreamEntityCandidates, normalizeEntityName } from "../src/server/dreamEntities.js";
import type { Dream } from "../src/types.js";

const dream: Dream = {
  id: 7, title: "The House", content: "Water filled the house.", date: "2026-01-01", time: null,
  location_lat: 0, location_lng: 0, location_name: "",
  feature_json: { version: 1, themes: ["Transformation"], symbols: ["Flood Water", "flood water"], characters: ["Grandfather"], locations: ["Childhood Home"], emotions: ["Fear"], transformations: ["Entering water"], objects: ["Key"], actions: ["Swimming"] },
  analysis_json: { version: 1, summary: "", core_interpretation: "", themes: [], symbols: [{ name: "Flood Water", context: "Inside the house", possible_meanings: [], confidence: "high" }], characters: [{ name: "Grandfather", role: "guide" }], locations: [{ name: "Childhood Home", significance: "Recurring family setting" }], emotions: [{ emotion: "Fear", intensity: "high", context: "Before entering" }], transformations: [], tensions: [], alternative_readings: [], reflection_questions: [], uncertainty_notes: [] },
};

const entities = extractDreamEntityCandidates(dream);
assert.equal(normalizeEntityName("  Flood—Water!  "), "flood water");
assert.equal(entities.filter(item => item.entity_type === "symbol").length, 1);
assert.equal(entities.find(item => item.entity_type === "symbol")?.confidence, "high");
assert.equal(entities.find(item => item.entity_type === "character")?.context, "guide");
assert.equal(entities.length, 8);
console.log("dream entity extraction verification passed");
