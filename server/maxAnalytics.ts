export type AnalyticsPost = {
  channelTitle: string | null;
  channelSubs: number | null;
  currentViews: number | null;
  views24h: number | null;
  views48h: number | null;
  views72h: number | null;
  er24h: number | null;
  postedAt: string | null;
  postUrl: string | null;
};

export type AnalyticsLinkReport = {
  type: "max-analytics";
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
  posts: AnalyticsPost[];
};

const MAX_ANALYTICS_HOST = "go.xn----7sbaab9baqgpd7d3b.xn--p1ai";

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }
  return null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function timestampToIso(value: unknown): string | null {
  const timestamp = asNumber(value);
  if (timestamp === null) return null;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getRecordValue(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined) return record[key];
  }
  return null;
}

/** Identifies public report pages in the format /ad/ad_... */
export function getMaxAnalyticsReportCode(url: URL): string | null {
  if (url.hostname.toLowerCase() !== MAX_ANALYTICS_HOST) return null;
  const match = url.pathname.match(/^\/ad\/(ad_[A-Za-z0-9_-]+)\/?$/);
  return match?.[1] ?? null;
}

export function getMaxAnalyticsApiUrl(url: URL, reportCode: string): string {
  return new URL(`/api/ad/${encodeURIComponent(reportCode)}?hours=48`, url.origin).toString();
}

/** The public report API does not require a Referer header. Keeping headers ASCII-only avoids URL encoding failures. */
export const MAX_ANALYTICS_FETCH_HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "User-Agent": "Mozilla/5.0 (compatible; MaxAdsManager/1.0)",
} as const;

/**
 * Converts the service API response to the application-wide post analytics
 * shape. The service stores its frozen 24-hour measurement in `views24`.
 */
export function parseMaxAnalyticsReport(payload: unknown, reportUrl: string): AnalyticsLinkReport {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const channels = Array.isArray(root.channels) ? root.channels : [];
  const posts = channels.map((item): AnalyticsPost => {
    const channel = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const reportAfter = asNumber(getRecordValue(channel, "reportAfter", "report_after"));
    const directViews24 = asNumber(getRecordValue(channel, "views24", "views_24h"));
    // Older reports may only preserve the value that was frozen at report time.
    // It is a valid 24-hour metric only when the report itself was scheduled for 24h.
    const frozenViews24 = reportAfter === 24
      ? asNumber(getRecordValue(channel, "frozenViews", "frozen_views"))
      : null;
    return {
      channelTitle: asText(getRecordValue(channel, "channelTitle", "channel_title", "title")),
      channelSubs: asNumber(getRecordValue(channel, "channelSubs", "channel_subs", "subscribers")),
      currentViews: asNumber(getRecordValue(channel, "views", "currentViews", "current_views")),
      views24h: directViews24 ?? frozenViews24,
      views48h: asNumber(getRecordValue(channel, "views48", "views_48h")),
      views72h: asNumber(getRecordValue(channel, "views72", "views_72h")),
      er24h: null,
      postedAt: timestampToIso(getRecordValue(channel, "publishedAt", "published_at")),
      postUrl: asText(getRecordValue(channel, "channelLink", "channel_link")) ?? reportUrl,
    };
  });

  const sum = (field: keyof AnalyticsPost): number | null => {
    const values = posts.map((post) => post[field]).filter((value): value is number => typeof value === "number");
    return values.length ? values.reduce((total, value) => total + value, 0) : null;
  };

  const rootSummary = root.summary && typeof root.summary === "object" ? root.summary as Record<string, unknown> : {};
  const firstPostedAt = posts.find((post) => post.postedAt)?.postedAt ?? null;
  return {
    type: "max-analytics",
    draftName: asText(getRecordValue(root, "draftName", "draft_name")),
    publishedAt: timestampToIso(getRecordValue(root, "publishedAt", "published_at")) ?? firstPostedAt,
    summary: {
      currentViews: asNumber(getRecordValue(rootSummary, "views", "currentViews", "current_views"))
        ?? asNumber(getRecordValue(root, "views", "currentViews", "current_views"))
        ?? sum("currentViews"),
      views24h: asNumber(getRecordValue(rootSummary, "views24", "views_24h"))
        ?? asNumber(getRecordValue(root, "views24", "views_24h"))
        ?? sum("views24h"),
      views48h: asNumber(getRecordValue(rootSummary, "views48", "views_48h"))
        ?? asNumber(getRecordValue(root, "views48", "views_48h"))
        ?? sum("views48h"),
      views72h: asNumber(getRecordValue(rootSummary, "views72", "views_72h"))
        ?? asNumber(getRecordValue(root, "views72", "views_72h"))
        ?? sum("views72h"),
      er24h: null,
      subscribersTotal: null,
    },
    posts,
  };
}
