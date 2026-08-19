import { describe, expect, it } from "vitest";
import { canRefreshReachCorrectionList, resetReachCorrectionView } from "../client/src/lib/reachCorrectionUi";

describe("доступность обновления списка коррекции", () => {
  it("разрешает новый список сразу после завершённого прогона", () => {
    expect(canRefreshReachCorrectionList({ isReviewing: false, isFetching: false })).toBe(true);
  });

  it("блокирует кнопку только во время активной проверки или сетевого обновления", () => {
    expect(canRefreshReachCorrectionList({ isReviewing: true, isFetching: false })).toBe(false);
    expect(canRefreshReachCorrectionList({ isReviewing: false, isFetching: true })).toBe(false);
  });

  it("очищает завершённый результат перед новым запуском", () => {
    expect(resetReachCorrectionView()).toEqual({ hasReviewed: false, progress: 0, reviewedCount: 0 });
  });
});
