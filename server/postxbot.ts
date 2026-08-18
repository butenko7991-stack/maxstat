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
