import { describe, expect, it } from "vitest";
import { decideHistoricalReach, getViews24h, selectPostForChannel, shouldIncludeHistoricalReachDecision } from "../client/src/lib/reachExtraction";

describe("selectPostForChannel", () => {
  it("использует единственный пост из ссылки", () => {
    const selection = selectPostForChannel([
      { channelTitle: "Канал А", views24h: 1_250 },
    ], "Другой канал");

    expect(selection).toMatchObject({ kind: "single", post: { views24h: 1_250 } });
  });

  it("сопоставляет ровно один пост с названием канала независимо от регистра и разделителей", () => {
    const selection = selectPostForChannel([
      { channelTitle: "Психология — MAX", views24h: 1_250 },
      { channelTitle: "Маркетинг", views24h: 8_900 },
    ], "ПСИХОЛОГИЯ MAX");

    expect(selection).toMatchObject({ kind: "matched", post: { channelTitle: "Психология — MAX" } });
  });

  it("не подставляет первый пост, когда многоканальная ссылка не сопоставлена", () => {
    const selection = selectPostForChannel([
      { channelTitle: "Первый канал", views24h: 1_250 },
      { channelTitle: "Второй канал", views24h: 8_900 },
    ], "Третий канал");

    expect(selection).toEqual({ kind: "ambiguous", post: null });
  });

  it("не выбирает пост, если для одного названия найдено несколько совпадений", () => {
    const selection = selectPostForChannel([
      { channelTitle: "Новости MAX", views24h: 1_250 },
      { channelTitle: "Новости MAX — Москва", views24h: 8_900 },
    ], "Новости MAX");

    expect(selection).toEqual({ kind: "ambiguous", post: null });
  });
});

describe("getViews24h", () => {
  it("берёт только достоверные охваты за 24 часа", () => {
    expect(getViews24h({ views24h: 1_250, views48h: 2_000, views72h: 3_000 })).toBe(1_250);
  });

  it("не подменяет 24-часовые охваты значениями за 48 или 72 часа", () => {
    expect(getViews24h({ views48h: 2_000, views72h: 3_000 })).toBeNull();
  });

  it("не принимает отрицательные и нечисловые значения", () => {
    expect(getViews24h({ views24h: -1 })).toBeNull();
    expect(getViews24h({ views24h: Number.NaN })).toBeNull();
  });
});

describe("decideHistoricalReach", () => {
  it("разрешает пакетное обновление только для однозначного канала с охватом за 24 часа", () => {
    expect(decideHistoricalReach([
      { channelTitle: "Канал А", views24h: 2_500 },
      { channelTitle: "Канал Б", views24h: 6_000 },
    ], "Канал Б", 1_000)).toMatchObject({ status: "ready", proposedReach: 6_000 });
  });

  it("не включает в пакетное обновление общую ссылку без точного совпадения", () => {
    expect(decideHistoricalReach([
      { channelTitle: "Канал А", views24h: 2_500 },
      { channelTitle: "Канал Б", views24h: 6_000 },
    ], "Канал В", 1_000)).toMatchObject({ status: "ambiguous", proposedReach: null });
  });

  it("оставляет неизменной запись с уже корректным значением", () => {
    const decision = decideHistoricalReach([{ channelTitle: "Канал А", views24h: 2_500 }], "Канал А", 2_500);
    expect(decision).toMatchObject({ status: "same", proposedReach: 2_500 });
    expect(shouldIncludeHistoricalReachDecision(decision)).toBe(false);
  });

  it("оставляет в предпросмотре только записи, требующие действия или проверки", () => {
    const ready = decideHistoricalReach([{ channelTitle: "Канал А", views24h: 2_500 }], "Канал А", 1_000);
    const ambiguous = decideHistoricalReach([
      { channelTitle: "Канал А", views24h: 2_500 },
      { channelTitle: "Канал Б", views24h: 5_000 },
    ], "Другой канал", 1_000);

    expect(shouldIncludeHistoricalReachDecision(ready)).toBe(true);
    expect(shouldIncludeHistoricalReachDecision(ambiguous)).toBe(true);
  });
});
