import { describe, expect, it } from "vitest";
import { getMaxAnalyticsApiUrl, getMaxAnalyticsReferer, getMaxAnalyticsReportCode, parseMaxAnalyticsReport } from "./maxAnalytics";

const REPORT_URL = new URL("https://go.аналитика-мах.рф/ad/ad_-70945865509462_1786471897531_5pup1v");
const SAMPLE_RESPONSE = {
  views: 1472,
  views24: 924,
  channels: [
    { channelTitle: "Пока муж не видит", views: 572, views1: 77, views12: 199, views24: 346, views48: null, publishedAt: "1786546821654" },
    { channelTitle: "НЕидеальный муж", views: 900, views1: 122, views12: 372, views24: 578, views48: null, publishedAt: "1786546821869" },
  ],
};

describe("Аналитика МАХ", () => {
  it("распознаёт публичный формат рекламной ссылки и строит API URL", () => {
    const code = getMaxAnalyticsReportCode(REPORT_URL);
    expect(code).toBe("ad_-70945865509462_1786471897531_5pup1v");
    expect(getMaxAnalyticsApiUrl(REPORT_URL, code!)).toBe(
      "https://go.xn----7sbaab9baqgpd7d3b.xn--p1ai/api/ad/ad_-70945865509462_1786471897531_5pup1v?hours=48"
    );
    expect(getMaxAnalyticsReferer(REPORT_URL)).toBe(
      "https://go.xn----7sbaab9baqgpd7d3b.xn--p1ai/ad/ad_-70945865509462_1786471897531_5pup1v"
    );
  });

  it("переносит общий и поканальный охват за 24 часа из JSON API", () => {
    const report = parseMaxAnalyticsReport(SAMPLE_RESPONSE, REPORT_URL.toString());
    expect(report.type).toBe("max-analytics");
    expect(report.summary.views24h).toBe(924);
    expect(report.summary.currentViews).toBe(1472);
    expect(report.posts).toMatchObject([
      { channelTitle: "Пока муж не видит", views24h: 346, currentViews: 572 },
      { channelTitle: "НЕидеальный муж", views24h: 578, currentViews: 900 },
    ]);
  });

  it("не принимает ссылки другого хоста как отчёты Аналитики МАХ", () => {
    expect(getMaxAnalyticsReportCode(new URL("https://example.com/ad/ad_123"))).toBeNull();
  });

  it("использует зафиксированный охват старого отчёта только при контрольной точке 24 часа", () => {
    const legacyReport = parseMaxAnalyticsReport({
      channels: [{ channelTitle: "Канал", views: 700, reportAfter: 24, frozenViews: 420 }],
    }, REPORT_URL.toString());
    const lateReport = parseMaxAnalyticsReport({
      channels: [{ channelTitle: "Канал", views: 700, reportAfter: 48, frozenViews: 610 }],
    }, REPORT_URL.toString());

    expect(legacyReport.posts[0].views24h).toBe(420);
    expect(legacyReport.summary.views24h).toBe(420);
    expect(lateReport.posts[0].views24h).toBeNull();
  });
});
