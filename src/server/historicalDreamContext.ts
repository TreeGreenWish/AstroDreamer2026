import type { Dream, DreamFeaturesV1, HistoricalDreamContext } from "../types.js";

const STOP_WORDS = new Set([
  "about", "after", "again", "also", "because", "been", "before", "being", "could", "dream",
  "from", "have", "into", "just", "like", "more", "some", "that", "their", "there", "these",
  "they", "this", "through", "very", "was", "were", "what", "when", "where", "which", "while",
  "with", "would", "your",
]);

function normalize(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function tokens(value: string) {
  return new Set(normalize(value).split(" ").filter(word => word.length >= 4 && !STOP_WORDS.has(word)));
}

function features(dream: Dream): string[] {
  const data = (dream.feature_json || {}) as Partial<DreamFeaturesV1>;
  return [...new Set([
    ...(data.themes || []), ...(data.symbols || []), ...(data.characters || []),
    ...(data.locations || []), ...(data.emotions || []), ...(data.transformations || []),
    ...(data.objects || []), ...(data.actions || []), ...(dream.tags || []),
  ].map(normalize).filter(Boolean))];
}

function sameDream(a: Dream, b: Dream) {
  return Boolean(a.id && b.id && a.id === b.id)
    || (a.date === b.date && normalize(a.title) === normalize(b.title) && normalize(a.content) === normalize(b.content));
}

export function buildHistoricalDreamContext(current: Dream, corpus: Dream[], limit = 8): HistoricalDreamContext {
  const currentText = normalize(`${current.title} ${current.content}`);
  const currentTokens = tokens(currentText);
  const candidates = corpus.filter(dream => !sameDream(current, dream)).map(dream => {
    const candidateFeatures = features(dream);
    const sharedSignals = candidateFeatures.filter(signal => currentText.includes(signal));
    const candidateTokens = tokens(`${dream.title} ${dream.content}`);
    const tokenOverlap = [...currentTokens].filter(token => candidateTokens.has(token));
    const relevanceScore = sharedSignals.length * 4 + Math.min(tokenOverlap.length, 8);
    return {
      dream_id: dream.id || 0,
      title: dream.title,
      date: dream.date,
      summary: dream.analysis_json?.summary || dream.content.slice(0, 280),
      shared_signals: [...new Set([...sharedSignals, ...tokenOverlap.slice(0, 5)])],
      relevance_score: relevanceScore,
    };
  }).filter(item => item.dream_id > 0 && item.relevance_score > 0)
    .sort((a, b) => b.relevance_score - a.relevance_score || b.date.localeCompare(a.date));

  const matchedDreams = candidates.slice(0, limit);
  const signals = [...new Set(matchedDreams.flatMap(item => item.shared_signals))];
  const signalCounts = signals.map(signal => {
    const dreamIds = corpus.filter(dream => dream.id && (
      features(dream).includes(signal) || normalize(`${dream.title} ${dream.content}`).includes(signal)
    )).map(dream => dream.id as number);
    return { signal, dream_count: dreamIds.length, dream_ids: dreamIds };
  }).filter(item => item.dream_count > 0).sort((a, b) => b.dream_count - a.dream_count);

  return { corpus_size: corpus.length, matched_dreams: matchedDreams, signal_counts: signalCounts };
}
