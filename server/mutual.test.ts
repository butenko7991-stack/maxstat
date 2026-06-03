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
    createMutualDealWithRecords: vi.fn(),
    updateMutualDealWithRecords: vi.fn(),
    deleteMutualDealWithRecords: vi.fn(),
  };
});

const mockGetMutualDeals = vi.mocked(db.getMutualDeals);
const mockCreateMutualDeal = vi.mocked(db.createMutualDeal);
const mockUpdateMutualDeal = vi.mocked(db.updateMutualDeal);
const mockDeleteMutualDeal = vi.mocked(db.deleteMutualDeal);
const mockCalcRecommendedDoplate = vi.mocked(db.calcRecommendedDoplate);
const mockCreateMutualDealWithRecords = vi.mocked(db.createMutualDealWithRecords);
const mockUpdateMutualDealWithRecords = vi.mocked(db.updateMutualDealWithRecords);
const mockDeleteMutualDealWithRecords = vi.mocked(db.deleteMutualDealWithRecords);

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
      { id: 1, partnerChannelName: "@partner1", status: "предложение", month: "2026-05", dealType: "без доплаты", saleRecordId: 10, purchaseRecordId: 20 },
      { id: 2, partnerChannelName: "@partner2", status: "завершено", month: "2026-05", dealType: "с доплатой", saleRecordId: 11, purchaseRecordId: 21 },
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

  it("returns saleRecordId and purchaseRecordId in each deal", async () => {
    const mockDeals = [
      { id: 5, partnerChannelName: "@ch", status: "размещено", month: "2026-06", dealType: "без доплаты", saleRecordId: 100, purchaseRecordId: 200 },
    ];
    mockGetMutualDeals.mockResolvedValue(mockDeals as any);
    const result = await db.getMutualDeals(1, {});
    expect((result[0] as any).saleRecordId).toBe(100);
    expect((result[0] as any).purchaseRecordId).toBe(200);
  });
});

// ─── createMutualDeal (legacy) ────────────────────────────────────────────────
describe("createMutualDeal", () => {
  it("creates a deal without doplate", async () => {
    mockCreateMutualDeal.mockResolvedValue(42);
    const id = await db.createMutualDeal({
      userId: 1,
      ourChannelId: 5,
      partnerChannelName: "@testchannel",
      partnerContact: null,
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
    } as any);
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
    } as any);
    expect(id).toBe(43);
  });
});

// ─── createMutualDealWithRecords (umbrella) ───────────────────────────────────
describe("createMutualDealWithRecords", () => {
  it("creates umbrella deal without doplate — cost is 0 for both records", async () => {
    mockCreateMutualDealWithRecords.mockResolvedValue(50);
    const id = await db.createMutualDealWithRecords({
      userId: 1,
      ourChannelId: 3,
      partnerChannelName: "@partner_a",
      partnerContact: null,
      ourPostDate: new Date("2026-06-01"),
      partnerPostDate: new Date("2026-06-02"),
      ourReach: 40000,
      partnerReach: 40000,
      dealType: "без доплаты",
      dopDirection: null,
      dopAmount: null,
      dopPaymentStatus: "not_applicable",
      ourPostLink: "https://t.me/our/1",
      partnerPostLink: "https://t.me/partner/1",
      status: "согласовано",
      month: "2026-06",
      notes: null,
    });
    expect(id).toBe(50);
    expect(mockCreateMutualDealWithRecords).toHaveBeenCalledOnce();
    const callArg = mockCreateMutualDealWithRecords.mock.calls[0][0];
    expect(callArg.dealType).toBe("без доплаты");
    expect(callArg.ourReach).toBe(40000);
  });

  it("creates umbrella deal with doplate 'нам платят' — sale gets revenue, purchase cost 0", async () => {
    mockCreateMutualDealWithRecords.mockResolvedValue(51);
    const id = await db.createMutualDealWithRecords({
      userId: 1,
      ourChannelId: 3,
      partnerChannelName: "@small_channel",
      partnerContact: null,
      ourPostDate: new Date("2026-06-05"),
      partnerPostDate: new Date("2026-06-06"),
      ourReach: 80000,
      partnerReach: 30000,
      dealType: "с доплатой",
      dopDirection: "нам платят",
      dopAmount: "600",
      dopPaymentStatus: "unpaid",
      ourPostLink: null,
      partnerPostLink: null,
      status: "согласовано",
      month: "2026-06",
      notes: null,
    });
    expect(id).toBe(51);
    const callArg = mockCreateMutualDealWithRecords.mock.calls[0][0];
    expect(callArg.dopDirection).toBe("нам платят");
    expect(callArg.dopAmount).toBe("600");
  });

  it("creates umbrella deal with doplate 'мы платим' — purchase gets cost, sale revenue 0", async () => {
    mockCreateMutualDealWithRecords.mockResolvedValue(52);
    await db.createMutualDealWithRecords({
      userId: 1,
      ourChannelId: 3,
      partnerChannelName: "@big_channel",
      partnerContact: null,
      ourPostDate: new Date("2026-06-10"),
      partnerPostDate: new Date("2026-06-11"),
      ourReach: 20000,
      partnerReach: 100000,
      dealType: "с доплатой",
      dopDirection: "мы платим",
      dopAmount: "1000",
      dopPaymentStatus: "unpaid",
      ourPostLink: null,
      partnerPostLink: null,
      status: "согласовано",
      month: "2026-06",
      notes: null,
    });
    const callArg = mockCreateMutualDealWithRecords.mock.calls[0][0];
    expect(callArg.dopDirection).toBe("мы платим");
    expect(callArg.dopAmount).toBe("1000");
  });
});

// ─── updateMutualDealWithRecords (umbrella) ───────────────────────────────────
describe("updateMutualDealWithRecords", () => {
  it("updates deal and syncs linked sale/purchase records", async () => {
    mockUpdateMutualDealWithRecords.mockResolvedValue(undefined);
    await db.updateMutualDealWithRecords(50, 1, {
      ourReach: 45000,
      partnerReach: 42000,
      status: "размещено",
    });
    expect(mockUpdateMutualDealWithRecords).toHaveBeenCalledWith(50, 1, {
      ourReach: 45000,
      partnerReach: 42000,
      status: "размещено",
    });
  });

  it("updates doplate amount and syncs cost", async () => {
    mockUpdateMutualDealWithRecords.mockResolvedValue(undefined);
    await db.updateMutualDealWithRecords(51, 1, {
      dopAmount: "800",
      dopPaymentStatus: "paid",
    });
    expect(mockUpdateMutualDealWithRecords).toHaveBeenCalledOnce();
  });
});

// ─── deleteMutualDealWithRecords (umbrella) ───────────────────────────────────
describe("deleteMutualDealWithRecords", () => {
  it("deletes deal and cascades to linked sale/purchase records", async () => {
    mockDeleteMutualDealWithRecords.mockResolvedValue(undefined);
    await db.deleteMutualDealWithRecords(50, 1);
    expect(mockDeleteMutualDealWithRecords).toHaveBeenCalledWith(50, 1);
  });

  it("handles deletion when linked records are missing gracefully", async () => {
    mockDeleteMutualDealWithRecords.mockResolvedValue(undefined);
    await db.deleteMutualDealWithRecords(999, 1);
    expect(mockDeleteMutualDealWithRecords).toHaveBeenCalledOnce();
  });
});

// ─── updateMutualDeal (legacy) ────────────────────────────────────────────────
describe("updateMutualDeal", () => {
  it("updates deal status", async () => {
    mockUpdateMutualDeal.mockResolvedValue(undefined);
    await db.updateMutualDeal(42, 1, { status: "размещено" });
    expect(mockUpdateMutualDeal).toHaveBeenCalledWith(42, 1, { status: "размещено" });
  });
});

// ─── deleteMutualDeal (legacy) ────────────────────────────────────────────────
describe("deleteMutualDeal", () => {
  it("deletes a deal by id", async () => {
    mockDeleteMutualDeal.mockResolvedValue(undefined);
    await db.deleteMutualDeal(42, 1);
    expect(mockDeleteMutualDeal).toHaveBeenCalledWith(42, 1);
  });
});
