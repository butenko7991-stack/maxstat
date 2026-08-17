import { describe, expect, it } from "vitest";
import { decideHistoricalRepair, getHistoricalRepairApiUrl } from "./historicalReachRepair";

const LINK = "https://go.аналитика-мах.рф/ad/ad_-70945865509462_1786818548541_1j8v7l";
const PAYLOAD = {
  channels: [
    { channelTitle: "Пока муж не видит", reportAfter: 24, views24: 336 },
    { channelTitle: "НЕидеальный муж", reportAfter: 24, views24: 552 },
  ],
};

describe("прямой запуск массовой коррекции", () => {
  it("использует JSON API без Referer для кириллической ссылки", () => {
    expect(getHistoricalRepairApiUrl(LINK)).toBe(
      "https://go.xn----7sbaab9baqgpd7d3b.xn--p1ai/api/ad/ad_-70945865509462_1786818548541_1j8v7l?hours=48",
    );
  });

  it("разрешает обновление только точного канала с сохранённым охватом за 24 часа", () => {
    expect(decideHistoricalRepair(PAYLOAD, "Пока муж не видит", 500)).toMatchObject({ status: "ready", proposedReach: 336 });
    expect(decideHistoricalRepair(PAYLOAD, "НЕидеальный муж", 552)).toMatchObject({ status: "same", proposedReach: 552 });
    expect(decideHistoricalRepair(PAYLOAD, "Другой канал", 500)).toMatchObject({ status: "ambiguous" });
  });
});
