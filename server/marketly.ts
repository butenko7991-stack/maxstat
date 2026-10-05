export type MarketlyAnalyticsPost = {
  channelTitle: string | null;
  channelSubs: number | null;
  currentViews: number | null;
  views24h: number | null;
  views24hEstimated: boolean;
  views48h: number | null;
  views72h: number | null;
  er24h: number | null;
  postedAt: string | null;
  postUrl: string | null;
  postText: string | null;
  postPreview: string | null;
};

export type MarketlyAnalyticsReport = {
  type: "marketly";
  draftName: string | null;
  publishedAt: string | null;
  summary: {
    currentViews: number | null;
    views24h: number | null;
    /** True only when the source omitted hour 24 and it was restored from two surrounding snapshots. */
    views24hEstimated: boolean;
    views48h: number | null;
    views72h: number | null;
    er24h: number | null;
    subscribersTotal: number | null;
  };
  posts: MarketlyAnalyticsPost[];
};

const MARKETLY_HOSTS = new Set(["marketly.ru", "otlozhka.marketly.ru"]);
const MARKETLY_STATS_PATH = /^\/analytics\/stats\/([a-f0-9-]+)\/?$/i;

export const MARKETLY_FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ru-RU,ru;q=0.9",
} as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asMetric(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : null;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\s\u00A0]/g, "").replace(/,/g, ".");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getValue(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return null;
}

/**
 * `targetsData` is embedded as a JSON array inside the report's script. A bracket
 * scan is used instead of a non-greedy regex, because target objects can contain
 * nested arrays and strings with brackets.
 */
export function extractMarketlyTargets(html: string): unknown[] | null {
  const declaration = /(?:var|let|const|window\.)\s*targetsData\s*=\s*/i.exec(html);
  if (!declaration || declaration.index === undefined) return null;

  let start = declaration.index + declaration[0].length;
  while (start < html.length && /\s/.test(html[start])) start += 1;
  if (html[start] !== "[") return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  let quote = "";
  for (let index = start; index < html.length; index += 1) {
    const character = html[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) inString = false;
      continue;
    }
    if (character === '"' || character === "'") {
      inString = true;
      quote = character;
    } else if (character === "[") {
      depth += 1;
    } else if (character === "]") {
      depth -= 1;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(html.slice(start, index + 1));
          return Array.isArray(parsed) ? parsed : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function getStatisticsEntries(target: Record<string, unknown>): Array<{ time: number; value: number }> {
  const source = getValue(target, "statistics", "stats", "history", "viewsHistory", "views_history");
  if (Array.isArray(source)) {
    return source.flatMap((point) => {
      const item = asRecord(point);
      if (!item) return [];
      const time = asMetric(getValue(item, "minutes", "minute", "seconds", "second", "time", "duration"));
      const value = asMetric(getValue(item, "views", "value", "reach", "count", "currentViews", "current_views"));
      return time === null || value === null ? [] : [{ time, value }];
    });
  }

  const statistics = asRecord(source);
  if (!statistics) return [];
  return Object.entries(statistics).flatMap(([timeKey, rawValue]) => {
    const time = Number(timeKey);
    const value = asMetric(rawValue);
    return Number.isFinite(time) && time >= 0 && value !== null ? [{ time, value }] : [];
  });
}

type TimedMetric = { value: number | null; estimated: boolean };

function metricAtHours(target: Record<string, unknown>, hours: number): TimedMetric {
  const directKeys = hours === 24
    ? ["views24", "views24h", "views_24h", "viewsAt24", "views_at_24"]
    : hours === 48
      ? ["views48", "views48h", "views_48h", "viewsAt48", "views_at_48"]
      : ["views72", "views72h", "views_72h", "viewsAt72", "views_at_72"];
  const direct = asMetric(getValue(target, ...directKeys));
  if (direct !== null) return { value: direct, estimated: false };

  const reportAfter = asMetric(getValue(target, "reportAfter", "report_after"));
  if (reportAfter === hours) {
    const frozen = asMetric(getValue(target, "frozenViews", "frozen_views", "viewsFrozen", "views_frozen"));
    if (frozen !== null) return { value: frozen, estimated: false };
  }

  const entries = getStatisticsEntries(target);
  if (entries.length === 0) return { value: null, estimated: false };
  // Marketly has published both minute-based history (1,440) and second-based
  // history (86,400). Infer the unit from the stored time scale.
  const seconds = Math.max(...entries.map((entry) => entry.time)) > 10_000;
  const targetTime = hours * (seconds ? 3_600 : 60);
  const allowedGap = seconds ? 3_600 : 60;
  const candidates = entries
    .filter((entry) => entry.time <= targetTime && entry.time >= targetTime - allowedGap)
    .sort((left, right) => right.time - left.time);
  if (candidates[0]) {
    return { value: candidates[0].value, estimated: candidates[0].time !== targetTime };
  }

  // Some historic Marketly reports retain a complete graph but have a collection
  // pause around hour 24 (for example, 17h then 43h). Use both surrounding
  // cumulative snapshots to restore the 24-hour point rather than dropping the
  // whole campaign. A single-sided value is never used, so a partial grid total
  // cannot be written by accident.
  const before = entries
    .filter((entry) => entry.time < targetTime && entry.time >= targetTime - (seconds ? 43_200 : 720))
    .sort((left, right) => right.time - left.time)[0];
  const after = entries
    .filter((entry) => entry.time > targetTime && entry.time <= targetTime + (seconds ? 86_400 : 1_440))
    .sort((left, right) => left.time - right.time)[0];
  if (!before || !after || after.time === before.time) return { value: null, estimated: false };

  const progress = (targetTime - before.time) / (after.time - before.time);
  const interpolated = before.value + (after.value - before.value) * progress;
  return Number.isFinite(interpolated) && interpolated >= 0
    ? { value: Math.round(interpolated), estimated: true }
    : { value: null, estimated: false };
}

function currentViews(target: Record<string, unknown>): number | null {
  const direct = asMetric(getValue(target, "current_views", "currentViews", "views", "viewCount", "view_count"));
  if (direct !== null) return direct;
  const entries = getStatisticsEntries(target).sort((left, right) => right.time - left.time);
  return entries[0]?.value ?? null;
}

function sumIfComplete(posts: MarketlyAnalyticsPost[], field: keyof Pick<MarketlyAnalyticsPost, "currentViews" | "views24h" | "views48h" | "views72h" | "channelSubs">): number | null {
  if (posts.length === 0) return null;
  const values = posts.map((post) => post[field]);
  return values.every((value): value is number => typeof value === "number" && Number.isFinite(value))
    ? values.reduce((total, value) => total + value, 0)
    : null;
}

export function isMarketlyAnalyticsUrl(url: URL): boolean {
  return MARKETLY_HOSTS.has(url.hostname.toLowerCase())
    && MARKETLY_STATS_PATH.test(url.pathname);
}

/**
 * Marketly moved reports between marketly.ru and otlozhka.marketly.ru.
 * A report can still work on only one of the two hosts, so try both without
 * changing the link kept in the user's purchase record.
 */
export function getMarketlyReportMirrors(url: URL): string[] {
  const reportId = url.pathname.match(MARKETLY_STATS_PATH)?.[1];
  if (!reportId) return [url.toString()];
  const path = `/analytics/stats/${reportId}`;
  return Array.from(new Set([
    url.toString(),
    `https://otlozhka.marketly.ru${path}`,
    `https://marketly.ru${path}`,
  ]));
}

function metricAfterLabel(source: string, label: RegExp): number | null {
  const match = label.exec(source);
  if (!match || match.index === undefined) return null;
  const nearby = source.slice(match.index + match[0].length, match.index + match[0].length + 180);
  const number = /\b\d[\d\s\u00A0]*\b/.exec(nearby)?.[0];
  return number ? asMetric(number) : null;
}

/**
 * Jina Reader is used only as a read-only fallback when a VPS cannot reach a
 * public Marketly report directly. Its Markdown retains the source's campaign
 * total ("За 24 ч"), which is safer than summing incomplete channel rows.
 */
export function parseMarketlyReaderMarkdown(markdown: string, reportUrl: string): MarketlyAnalyticsReport | null {
  const views24h = metricAfterLabel(markdown, /За\s*24\s*ч\.?/i);
  if (views24h === null) return null;
  const currentViews = metricAfterLabel(markdown, /Сейчас[\s\S]{0,80}?Просмотры/i);
  const published = /Обновлено:\s*(\d{2})\.(\d{2})\.(\d{4}),\s*(\d{2}):(\d{2})/i.exec(markdown);
  const publishedAt = published
    ? new Date(`${published[3]}-${published[2]}-${published[1]}T${published[4]}:${published[5]}:00+03:00`).toISOString()
    : null;
  const postTitle = /^\*\*(.+?)\*\*/m.exec(markdown)?.[1]?.trim() ?? null;

  return {
    type: "marketly",
    draftName: postTitle,
    publishedAt,
    summary: {
      currentViews,
      views24h,
      views24hEstimated: false,
      views48h: null,
      views72h: null,
      er24h: null,
      subscribersTotal: null,
    },
    posts: [{
      channelTitle: null,
      channelSubs: null,
      currentViews,
      views24h,
      views24hEstimated: false,
      views48h: null,
      views72h: null,
      er24h: null,
      postedAt: publishedAt,
      postUrl: reportUrl,
      postText: postTitle,
      postPreview: postTitle,
    }],
  };
}

/**
 * One Marketly report can contain several external placements. The 24-hour
 * campaign result is valid only when every placement has a 24-hour checkpoint;
 * otherwise returning a partial total would understate a purchase.
 */
export function parseMarketlyAnalyticsPage(html: string, reportUrl: string): MarketlyAnalyticsReport {
  const targets = extractMarketlyTargets(html) ?? [];
  const posts = targets.flatMap((rawTarget): MarketlyAnalyticsPost[] => {
    const target = asRecord(rawTarget);
    if (!target) return [];
    const at24h = metricAtHours(target, 24);
    return [{
      channelTitle: asText(getValue(target, "channel_title", "channelTitle", "channel_name", "channelName", "title")),
      channelSubs: asMetric(getValue(target, "subscribers_count", "channelSubs", "channel_subs", "subscribers")),
      currentViews: currentViews(target),
      views24h: at24h.value,
      views24hEstimated: at24h.estimated,
      views48h: metricAtHours(target, 48).value,
      views72h: metricAtHours(target, 72).value,
      er24h: null,
      postedAt: asText(getValue(target, "published_at", "publishedAt", "date")),
      postUrl: reportUrl,
      postText: asText(getValue(target, "post_text", "postText", "message", "text")),
      postPreview: asText(getValue(target, "post_preview", "postPreview", "preview")),
    }];
  });
  const firstPost = posts[0] ?? null;
  const views24h = sumIfComplete(posts, "views24h");

  return {
    type: "marketly",
    draftName: null,
    publishedAt: firstPost?.postedAt ?? null,
    summary: {
      currentViews: sumIfComplete(posts, "currentViews"),
      views24h,
      views24hEstimated: views24h !== null && posts.some((post) => post.views24hEstimated),
      views48h: sumIfComplete(posts, "views48h"),
      views72h: sumIfComplete(posts, "views72h"),
      er24h: null,
      subscribersTotal: sumIfComplete(posts, "channelSubs"),
    },
    posts,
  };
}
