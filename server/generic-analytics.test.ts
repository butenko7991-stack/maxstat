import { describe, expect, it } from "vitest";
import { normalizeGenericAnalyticsReport } from "./genericAnalytics";

const REPORT_URL = "https://example-tracker.test/report/abc";

describe("нормализация неизвестных трекеров", () => {
  it("предпочитает явно показанный общий охват сетки неполным строкам каналов", () => {
    const report = normalizeGenericAnalyticsReport({
      draftName: "Сетка каналов",
      summary: { views24h: 1_940, currentViews: 2_860, er24h: 8.6 },
      posts: [
        { channelTitle: "Канал А", views24h: 920, currentViews: 1_350 },
        { channelTitle: "Канал Б", views24h: null, currentViews: 1_510 },
      ],
    }, REPORT_URL);

    expect(report.summary).toMatchObject({ views24h: 1_940, currentViews: 2_860, er24h: 8.6 });
    expect(report.posts).toHaveLength(2);
  });

  it("суммирует строки только когда показатель есть у каждого размещения", () => {
    const report = normalizeGenericAnalyticsReport({
      posts: [
        { channelTitle: "Канал А", views24h: 320 },
        { channelTitle: "Канал Б", views24h: 680 },
      ],
    }, REPORT_URL);

    expect(report.summary.views24h).toBe(1_000);
  });

  it("не записывает частичный итог, если бот не показал общий показатель", () => {
    const report = normalizeGenericAnalyticsReport({
      posts: [
        { channelTitle: "Канал А", views24h: 320 },
        { channelTitle: "Канал Б", views24h: null },
      ],
    }, REPORT_URL);

    expect(report.summary.views24h).toBeNull();
  });

  it("принимает строковые показатели от страниц без JSON API", () => {
    const report = normalizeGenericAnalyticsReport({
      postedAt: "2026-10-04T09:00:00.000Z",
      summary: { views24h: "1 250", er24h: "7,5", subscribersTotal: "12 000" },
      posts: [],
    }, REPORT_URL);

    expect(report.summary).toMatchObject({ views24h: 1_250, er24h: 7.5, subscribersTotal: 12_000 });
  });
});
