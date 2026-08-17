import { describe, expect, it } from "vitest";
import { getViews24h, selectPostForChannel } from "../client/src/lib/reachExtraction";

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
