import { describe, it, expect, vi, beforeEach } from "vitest";
import * as db from "./db";

// ─── Mock db helpers ──────────────────────────────────────────────────────────
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof db>();
  return {
    ...actual,
    getMutualDeals: vi.fn(),
    getMutualDealById: vi.fn(),
    createMutualDeal: vi.fn(),
    updateMutualDeal: vi.fn(),
    deleteMutualDeal: vi.fn(),
    calcRecommendedDoplate: vi.fn(),
  };
});

const mockGetMutualDeals = vi.mocked(db.getMutualDeals);
const mockCreateMutualDeal = vi.mocked(db.createMutualDeal);
const mockUpdateMutualDeal = vi.mocked(db.updateMutualDeal);
const mockDeleteMutualDeal = vi.mocked(db.deleteMutualDeal);
const mockCalcRecommendedDoplate = vi.mocked(db.calcRecommendedDoplate);

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── calcRecommendedDoplate unit tests ────────────────────────────────────────
describe("calcRecommendedDoplate", () => {
  it("returns zero diff when reaches are equal", () => {
    mockCalcRecommendedDoplate.mockReturnValue({
      diff: 0,
      direction: null,
      recommendedAmount: 0,
    });
    const result = db.calcRecommendedDoplate(50000, 50000);
    expect(result.diff).toBe(0);
    expect(result.direction).toBeNull();
    expect(result.recommendedAmount).toBe(0);
  });

  it("returns positive diff and 'нам платят' when our reach is higher", () => {
    mockCalcRecommendedDoplate.mockReturnValue({
      diff: 20000,
      direction: "нам платят",
      recommendedAmount: 200,
    });
    const result = db.calcRecommendedDoplate(70000, 50000);
    expect(result.diff).toBeGreaterThan(0);
    expect(result.direction).toBe("нам платят");
    expect(result.recommendedAmount).toBeGreaterThan(0);
  });

  it("returns negative diff and 'мы платим' when partner reach is higher", () => {
    mockCalcRecommendedDoplate.mockReturnValue({
      diff: -30000,
      direction: "мы платим",
      recommendedAmount: 300,
    });
    const result = db.calcRecommendedDoplate(40000, 70000);
    expect(result.diff).toBeLessThan(0);
    expect(result.direction).toBe("мы платим");
    expect(result.recommendedAmount).toBeGreaterThan(0);
  });
});

// ─── getMutualDeals ───────────────────────────────────────────────────────────
describe("getMutualDeals", () => {
  it("returns deals filtered by month", async () => {
    const mockDeals = [
      { id: 1, partnerChannelName: "@partner1", status: "предложение", month: "2026-05", dealType: "без доплаты" },
      { id: 2, partnerChannelName: "@partner2", status: "завершено", month: "2026-05", dealType: "с доплатой" },
    ];
    mockGetMutualDeals.mockResolvedValue(mockDeals as any);

    const result = await db.getMutualDeals(1, { month: "2026-05" });
    expect(result).toHaveLength(2);
    expect(mockGetMutualDeals).toHaveBeenCalledWith(1, { month: "2026-05" });
  });

  it("returns empty array when no deals", async () => {
    mockGetMutualDeals.mockResolvedValue([]);
    const result = await db.getMutualDeals(1, {});
    expect(result).toHaveLength(0);
  });
});

// ─── createMutualDeal ─────────────────────────────────────────────────────────
describe("createMutualDeal", () => {
  it("creates a deal without doplate", async () => {
    mockCreateMutualDeal.mockResolvedValue(42);
    const id = await db.createMutualDeal({
      userId: 1,
      ourChannelId: 5,
      partnerChannelName: "@testchannel",
      partnerContact: null,
      dealDate: null,
      ourReach: 50000,
      partnerReach: 50000,
      dealType: "без доплаты",
      dopDirection: null,
      dopAmount: null,
      dopPaymentStatus: "not_applicable",
      ourPostLink: null,
      partnerPostLink: null,
      status: "предложение",
      month: "2026-05",
      notes: null,
    });
    expect(id).toBe(42);
    expect(mockCreateMutualDeal).toHaveBeenCalledOnce();
  });

  it("creates a deal with doplate", async () => {
    mockCreateMutualDeal.mockResolvedValue(43);
    const id = await db.createMutualDeal({
      userId: 1,
      ourChannelId: 5,
      partnerChannelName: "@bigchannel",
      partnerContact: "@admin",
      dealDate: null,
      ourReach: 30000,
      partnerReach: 80000,
      dealType: "с доплатой",
      dopDirection: "мы платим",
      dopAmount: "500",
      dopPaymentStatus: "unpaid",
      ourPostLink: null,
      partnerPostLink: null,
      status: "согласовано",
      month: "2026-05",
      notes: "Хороший партнёр",
    });
    expect(id).toBe(43);
  });
});

// ─── updateMutualDeal ─────────────────────────────────────────────────────────
describe("updateMutualDeal", () => {
  it("updates deal status", async () => {
    mockUpdateMutualDeal.mockResolvedValue(undefined);
    await db.updateMutualDeal(42, 1, { status: "размещено" });
    expect(mockUpdateMutualDeal).toHaveBeenCalledWith(42, 1, { status: "размещено" });
  });
});

// ─── deleteMutualDeal ─────────────────────────────────────────────────────────
describe("deleteMutualDeal", () => {
  it("deletes a deal by id", async () => {
    mockDeleteMutualDeal.mockResolvedValue(undefined);
    await db.deleteMutualDeal(42, 1);
    expect(mockDeleteMutualDeal).toHaveBeenCalledWith(42, 1);
  });
});
