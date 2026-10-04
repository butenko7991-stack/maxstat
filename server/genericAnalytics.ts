export type GenericAnalyticsPost = {
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

export type GenericAnalyticsReport = {
  type: "generic";
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
  posts: GenericAnalyticsPost[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asMetric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.trunc(value);
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\s\u00A0]/g, "").replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null;
}

function asDecimal(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\s\u00A0]/g, "").replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function sumOnlyWhenComplete(posts: GenericAnalyticsPost[], field: "currentViews" | "views24h" | "views48h" | "views72h"): number | null {
  if (posts.length === 0) return null;
  const values = posts.map((post) => post[field]);
  return values.every((value): value is number => typeof value === "number" && Number.isFinite(value))
    ? values.reduce((total, value) => total + value, 0)
    : null;
}

/**
 * Normalizes an AI-extracted tracker page. A tracker may show an authoritative
 * campaign total even where some per-channel cards lack the frozen 24-hour
 * snapshot. The total is safe to use only when the source explicitly supplies
 * it; otherwise a partial channel sum is never returned.
 */
export function normalizeGenericAnalyticsReport(payload: unknown, reportUrl: string): GenericAnalyticsReport {
  const root = asRecord(payload) ?? {};
  const sourcePosts = Array.isArray(root.posts) ? root.posts : [];
  const sourceSummary = asRecord(root.summary) ?? {};
  const rootPostedAt = asText(root.postedAt);

  const posts = sourcePosts.map((value): GenericAnalyticsPost => {
    const post = asRecord(value) ?? {};
    return {
      channelTitle: asText(post.channelTitle),
      channelSubs: asMetric(post.channelSubs),
      currentViews: asMetric(post.currentViews),
      views24h: asMetric(post.views24h),
      views48h: asMetric(post.views48h),
      views72h: asMetric(post.views72h),
      er24h: asDecimal(post.er24h),
      postedAt: asText(post.postedAt) ?? rootPostedAt,
      postUrl: reportUrl,
    };
  });

  return {
    type: "generic",
    draftName: asText(root.draftName),
    publishedAt: rootPostedAt ?? posts[0]?.postedAt ?? null,
    summary: {
      currentViews: asMetric(sourceSummary.currentViews) ?? sumOnlyWhenComplete(posts, "currentViews"),
      views24h: asMetric(sourceSummary.views24h) ?? sumOnlyWhenComplete(posts, "views24h"),
      views48h: asMetric(sourceSummary.views48h) ?? sumOnlyWhenComplete(posts, "views48h"),
      views72h: asMetric(sourceSummary.views72h) ?? sumOnlyWhenComplete(posts, "views72h"),
      er24h: asDecimal(sourceSummary.er24h) ?? posts[0]?.er24h ?? null,
      subscribersTotal: asMetric(sourceSummary.subscribersTotal) ?? posts[0]?.channelSubs ?? null,
    },
    posts,
  };
}
