import { describe, expect, it } from "vitest";
import { isReachVerificationCurrent } from "./reachCorrectionState";

describe("актуальность подтверждения охвата", () => {
  const verifiedAt = new Date("2026-08-17T12:00:00.000Z");

  it("исключает запись, когда ссылка и охват не изменились после проверки", () => {
    expect(isReachVerificationCurrent({
      link: "https://go.аналитика-мах.рф/ad/example",
      reach: 888,
      reachVerifiedLink: "https://go.аналитика-мах.рф/ad/example",
      reachVerifiedValue: 888,
      reachVerifiedAt: verifiedAt,
    })).toBe(true);
  });

  it("возвращает запись на проверку, если изменились ссылка или охват", () => {
    expect(isReachVerificationCurrent({
      link: "https://go.аналитика-мах.рф/ad/new",
      reach: 888,
      reachVerifiedLink: "https://go.аналитика-мах.рф/ad/old",
      reachVerifiedValue: 888,
      reachVerifiedAt: verifiedAt,
    })).toBe(false);
    expect(isReachVerificationCurrent({
      link: "https://go.аналитика-мах.рф/ad/example",
      reach: 900,
      reachVerifiedLink: "https://go.аналитика-мах.рф/ad/example",
      reachVerifiedValue: 888,
      reachVerifiedAt: verifiedAt,
    })).toBe(false);
  });
});
