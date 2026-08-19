export type PostXbotReport = {
  type: "postxbot";
  draftName: string | null;
  publishedAt: string | null;
  summary: {
    currentViews: number | null;
    views24h: number | null;
    views48h: number | null;
    views72h: number | null;
    er24h: number | null;
    subscribersTotal: number | null;
  };
  posts: Array<{
    channelTitle: string | null;
    channelSubs: number | null;
    currentViews: number | null;
    views24h: number | null;
    views48h: number | null;
    views72h: number | null;
    er24h: number | null;
    postedAt: string | null;
    postUrl: string | null;
    postText: string | null;
    postPreview: string | null;
    mediaUrls: string[];
  }>;
};

const POSTXBOT_HOST = "max.postxbot.ru";
export const POSTXBOT_WATCH_API_URL = "https://maxapi.postxbot.ru/cabinet/v1/max/watchpost";

function parseMetric(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = value.replace(/&nbsp;/gi, " ").replace(/\s+/g, "").replace(/[^\d]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isPostXbotWatchUrl(url: URL): boolean {
  return url.hostname.toLowerCase() === POSTXBOT_HOST
    && /^\/watchpost\/[A-Za-z0-9_-]+\/?$/.test(url.pathname);
}

export function getPostXbotReportHash(url: URL): string | null {
  const match = url.pathname.match(/^\/watchpost\/([A-Za-z0-9_-]+)\/?$/);
  return match?.[1] ?? null;
}

function asMetric(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function sumTargetMetric(targets: unknown[], seconds: number): number | null {
  const values = targets
    .map((target) => {
      const statistics = target && typeof target === "object" && "statistics" in target
        ? (target as { statistics?: Record<string, unknown> }).statistics
        : undefined;
      return asMetric(statistics?.[String(seconds)]);
    })
    .filter((value): value is number => value !== null);

  return values.length > 0 ? values.reduce((total, value) => total + value, 0) : null;
}

function getLatestTargetMetric(target: unknown): number | null {
  const statistics = target && typeof target === "object" && "statistics" in target
    ? (target as { statistics?: Record<string, unknown> }).statistics
    : undefined;
  if (!statistics) return null;
  const entries = Object.entries(statistics)
    .map(([seconds, value]) => ({ seconds: Number(seconds), value: asMetric(value) }))
    .filter((entry): entry is { seconds: number; value: number } => Number.isFinite(entry.seconds) && entry.value !== null)
    .sort((left, right) => right.seconds - left.seconds);
  return entries[0]?.value ?? null;
}

/**
 * Parses the public JSON request that the PostXbot watch page itself uses.
 * A watch report is one advertising campaign; its 24h reach is the sum of
 * all placements' snapshots exactly at 86,400 seconds.
 */
export function parsePostXbotApiReport(payload: unknown, reportUrl: string): PostXbotReport {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const targets = Array.isArray(root.targets) ? root.targets : [];
  const views24h = sumTargetMetric(targets, 86_400);
  const views48h = sumTargetMetric(targets, 172_800);
  const views72h = sumTargetMetric(targets, 259_200);
  const currentValues = targets.map(getLatestTargetMetric).filter((value): value is number => value !== null);
  const currentViews = currentValues.length > 0 ? currentValues.reduce((total, value) => total + value, 0) : null;
  const post = root.post && typeof root.post === "object" ? root.post as Record<string, unknown> : undefined;
  const message = post?.message && typeof post.message === "object" ? post.message as Record<string, unknown> : undefined;
  const variants = Array.isArray(message?.variants) ? message.variants : [];
  const firstVariant = variants[0] && typeof variants[0] === "object" ? variants[0] as Record<string, unknown> : undefined;
  const postText = typeof firstVariant?.text === "string" ? decodeHtml(firstVariant.text) : null;

  return {
    type: "postxbot",
    draftName: null,
    publishedAt: null,
    summary: { currentViews, views24h, views48h, views72h, er24h: null, subscribersTotal: null },
    posts: views24h !== null
      ? [{
          channelTitle: null,
          channelSubs: null,
          currentViews,
          views24h,
          views48h,
          views72h,
          er24h: null,
          postedAt: null,
          postUrl: reportUrl,
          postText,
          postPreview: postText?.slice(0, 300) ?? null,
          mediaUrls: [],
        }]
      : [],
  };
}

/**
 * Parses a PostXbot campaign report. One observer URL represents one campaign
 * purchase, while the channel cards list external placements inside that campaign.
 * The report total is therefore the correct 24-hour reach for the purchase record.
 */
export function parsePostXbotReport(html: string, reportUrl: string): PostXbotReport {
  const cardMetrics = [...html.matchAll(/<b[^>]*>\s*([\d\s&nbsp;]+)\s*<\/b>\s*<small[^>]*>\s*([^<]+?)\s*<\/small>/gi)]
    .map((match) => ({ value: parseMetric(match[1]), label: decodeHtml(match[2]).toLowerCase() }));
  const views24h = cardMetrics.find((metric) => /^(за\s*)?24\s*ч\.?$/.test(metric.label))?.value ?? null;
  const currentViews = cardMetrics.find((metric) => /всего\s*просмотров/.test(metric.label))?.value ?? null;

  const postPreviewMatch = html.match(/<div[^>]+role="textbox"[^>]*>([\s\S]*?)<\/div>/i);
  const titleMatch = html.match(/<h1[^>]*>\s*(?:<[^>]+>)*\s*(.*?)\s*<\/h1>/i);
  return {
    type: "postxbot",
    draftName: titleMatch ? decodeHtml(titleMatch[1]) : null,
    publishedAt: null,
    summary: { currentViews, views24h, views48h: null, views72h: null, er24h: null, subscribersTotal: null },
    posts: views24h !== null
      ? [{
          channelTitle: null,
          channelSubs: null,
          currentViews,
          views24h,
          views48h: null,
          views72h: null,
          er24h: null,
          postedAt: null,
          postUrl: reportUrl,
          postText: postPreviewMatch ? decodeHtml(postPreviewMatch[1]) : null,
          postPreview: postPreviewMatch ? decodeHtml(postPreviewMatch[1]).slice(0, 300) : null,
          mediaUrls: [],
        }]
      : [],
  };
}
