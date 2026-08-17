export type CreativeMatchCandidate = {
  id: number;
  channelId: number;
  title: string | null;
  postText: string | null;
  recognizedText: string | null;
};

export type CreativeMatch = { channelId: number; creativeId: number; confidence: number } | null;

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .toLocaleLowerCase("ru-RU")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  return value.split(" ").filter((token) => token.length >= 3 && !["что", "это", "как", "для", "или", "все", "она", "они", "его", "так"].includes(token));
}

function similarity(reportText: string, creativeText: string): number {
  if (creativeText.length < 24 || reportText.length < 24) return 0;
  if (reportText.includes(creativeText) || creativeText.includes(reportText)) return 0.99;
  const reportTokens = new Set(tokens(reportText));
  const creativeTokens = new Set(tokens(creativeText));
  if (reportTokens.size < 5 || creativeTokens.size < 5) return 0;
  const overlap = [...creativeTokens].filter((token) => reportTokens.has(token)).length;
  if (overlap < 5) return 0;
  return overlap / Math.min(reportTokens.size, creativeTokens.size);
}

/** Returns a match only when one saved creative clearly identifies a channel. */
export function matchCreativeToChannel(reportText: string | null | undefined, creatives: CreativeMatchCandidate[]): CreativeMatch {
  const normalizedReport = normalizeText(reportText);
  if (normalizedReport.length < 24) return null;
  const candidates = creatives.flatMap((creative) => {
    const text = normalizeText(creative.postText || creative.recognizedText || creative.title);
    const confidence = similarity(normalizedReport, text);
    return confidence >= 0.78 ? [{ channelId: creative.channelId, creativeId: creative.id, confidence }] : [];
  }).sort((a, b) => b.confidence - a.confidence);
  if (candidates.length === 0) return null;
  const best = candidates[0];
  const sameScoreDifferentChannel = candidates.find((candidate) => candidate.channelId !== best.channelId && best.confidence - candidate.confidence < 0.08);
  return sameScoreDifferentChannel ? null : best;
}
