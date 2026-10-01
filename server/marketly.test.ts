import { describe, expect, it } from "vitest";
import { extractMarketlyTargets, isMarketlyAnalyticsUrl, parseMarketlyAnalyticsPage } from "./marketly";

const MARKETLY_URL = "https://marketly.ru/analytics/stats/ba08bc8a-1234-5678-9abc-def012345678";

function pageWithTargets(targets: unknown[]): string {
  return `<html><script>const targetsData = ${JSON.stringify(targets)};</script></html>`;
}

describe("отчёты Marketly", () => {
  it("распознаёт актуальный и исторический домены отчётов", () => {
    expect(isMarketlyAnalyticsUrl(new URL(MARKETLY_URL))).toBe(true);
    expect(isMarketlyAnalyticsUrl(new URL("https://otlozhka.marketly.ru/analytics/stats/ba08bc8a-1234-5678-9abc-def012345678"))).toBe(true);
    expect(isMarketlyAnalyticsUrl(new URL("https://marketly.ru/catalog"))).toBe(false);
  });

  it("извлекает и суммирует точные 24-часовые показатели всех размещений", () => {
    const report = parseMarketlyAnalyticsPage(pageWithTargets([
      {
        channel_title: "Канал А",
        subscribers_count: 12_000,
        current_views: 1_100,
        statistics: { "0": 0, "86400": 620, "172800": 810 },
      },
      {
        channel_title: "Канал Б",
        subscribers_count: 8_000,
        current_views: 1_000,
        statistics: { "0": 0, "86400": 580, "172800": 740 },
      },
    ]), MARKETLY_URL);

    expect(report.posts).toMatchObject([
      { channelTitle: "Канал А", views24h: 620, views48h: 810 },
      { channelTitle: "Канал Б", views24h: 580, views48h: 740 },
    ]);
    expect(report.summary).toMatchObject({ currentViews: 2_100, views24h: 1_200, views48h: 1_550 });
  });

  it("поддерживает минутную историю и ближайшую контрольную точку перед 24 часами", () => {
    const report = parseMarketlyAnalyticsPage(pageWithTargets([
      {
        channel_title: "Канал",
        statistics: { "1380": 446, "1410": 457, "1470": 465, "2880": 628 },
      },
    ]), MARKETLY_URL);

    expect(report.posts[0]).toMatchObject({ views24h: 457, views48h: 628 });
    expect(report.summary.views24h).toBe(457);
  });

  it("не возвращает частичную сумму, если хотя бы у одного канала нет 24-часового показателя", () => {
    const report = parseMarketlyAnalyticsPage(pageWithTargets([
      { channel_title: "Канал А", statistics: { "1440": 620, "2880": 810 } },
      { channel_title: "Канал Б", statistics: { "2880": 740 } },
    ]), MARKETLY_URL);

    expect(report.posts).toHaveLength(2);
    expect(report.posts[0].views24h).toBe(620);
    expect(report.posts[1].views24h).toBeNull();
    expect(report.summary.views24h).toBeNull();
  });

  it("корректно получает targetsData со скобками внутри строки", () => {
    const targets = extractMarketlyTargets('<script>window.targetsData = [{"channel_title":"Текст [объявления]","statistics":{"1440":321}}];</script>');
    expect(targets).toEqual([{ channel_title: "Текст [объявления]", statistics: { "1440": 321 } }]);
  });
});
