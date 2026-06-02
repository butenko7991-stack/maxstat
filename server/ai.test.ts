import { describe, it, expect, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB helpers ─────────────────────────────────────────────────────────

const mockProfitData = {
  totalSales: 15000,
  totalPurchases: 8000,
  totalProfit: 7000,
  overallROI: 87.5,
  channelCount: 2,
  salesCount: 5,
  purchasesCount: 3,
  channels: [
    {
      channelId: 1,
      channelName: "Твоя Алиса",
      salesTotal: 10000,
      salesCount: 3,
      purchasesTotal: 5000,
      purchasesCount: 2,
      profit: 5000,
      roi: 100,
      avgSaleCost: 3333.33,
      avgPurchaseCost: 2500,
      unpaidSalesTotal: 2000,
      unpaidPurchasesTotal: 0,
    },
    {
      channelId: 2,
      channelName: "НЕидеальный муж",
      salesTotal: 5000,
      salesCount: 2,
      purchasesTotal: 3000,
      purchasesCount: 1,
      profit: 2000,
      roi: 66.67,
      avgSaleCost: 2500,
      avgPurchaseCost: 3000,
      unpaidSalesTotal: 0,
      unpaidPurchasesTotal: 1000,
    },
  ],
  topChannel: "Твоя Алиса",
  worstChannel: "НЕидеальный муж",
};

const emptyProfitData = {
  totalSales: 0,
  totalPurchases: 0,
  totalProfit: 0,
  overallROI: 0,
  channelCount: 0,
  salesCount: 0,
  purchasesCount: 0,
  channels: [],
  topChannel: null,
  worstChannel: null,
};

vi.mock("./db", () => ({
  getChannelsByUser: vi.fn().mockResolvedValue([]),
  getChannelById: vi.fn().mockResolvedValue(null),
  createChannel: vi.fn().mockResolvedValue(1),
  updateChannel: vi.fn().mockResolvedValue(undefined),
  deleteChannel: vi.fn().mockResolvedValue(undefined),
  getPurchaseRecords: vi.fn().mockResolvedValue([]),
  createPurchaseRecord: vi.fn().mockResolvedValue(1),
  updatePurchaseRecord: vi.fn().mockResolvedValue(undefined),
  deletePurchaseRecord: vi.fn().mockResolvedValue(undefined),
  getSaleRecords: vi.fn().mockResolvedValue([]),
  createSaleRecord: vi.fn().mockResolvedValue(1),
  updateSaleRecord: vi.fn().mockResolvedValue(undefined),
  deleteSaleRecord: vi.fn().mockResolvedValue(undefined),
  getFinancialSummary: vi.fn().mockResolvedValue([]),
  getAvailableMonths: vi.fn().mockResolvedValue([]),
  getMonthlyStats: vi.fn().mockResolvedValue([]),
  getUnpaidDebts: vi.fn().mockResolvedValue([]),
  getAutocompleteSuggestions: vi.fn().mockResolvedValue({ admins: [], directions: [], buyers: [], platforms: [] }),
  getScheduleData: vi.fn().mockResolvedValue({ sales: [], purchases: [] }),
  checkBookingConflict: vi.fn().mockResolvedValue(null),
  getPurchaseById: vi.fn().mockResolvedValue(null),
  getSaleById: vi.fn().mockResolvedValue(null),
  upsertUser: vi.fn().mockResolvedValue(undefined),
  getUserByOpenId: vi.fn().mockResolvedValue(undefined),
  getChannelProfitability: vi.fn(),
  getCpfAnalytics: vi.fn().mockResolvedValue([]),
  listSubscriberSnapshots: vi.fn().mockResolvedValue([]),
  upsertSubscriberSnapshot: vi.fn().mockResolvedValue(undefined),
  deleteSubscriberSnapshot: vi.fn().mockResolvedValue(undefined),
  getSourceEfficiency: vi.fn().mockResolvedValue([]),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    id: "test-id",
    created: Date.now(),
    model: "test",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: "## Анализ\n\nВаш бизнес показывает хорошие результаты. ROI 87.5%.",
        },
        finish_reason: "stop",
      },
    ],
  }),
}));

// ─── Test context ─────────────────────────────────────────────────────────────

function makeCtx(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Тест Пользователь",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── AI Analytics Tests ──────────────────────────────────────────────────────

describe("ai.profitability", () => {
  it("returns profitability data for all time", async () => {
    const { getChannelProfitability } = await import("./db");
    (getChannelProfitability as ReturnType<typeof vi.fn>).mockResolvedValue(mockProfitData);

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.ai.profitability({ month: undefined });

    expect(result.totalSales).toBe(15000);
    expect(result.totalPurchases).toBe(8000);
    expect(result.totalProfit).toBe(7000);
    expect(result.channels).toHaveLength(2);
    expect(result.channels[0].channelName).toBe("Твоя Алиса");
  });

  it("returns profitability data for specific month", async () => {
    const { getChannelProfitability } = await import("./db");
    (getChannelProfitability as ReturnType<typeof vi.fn>).mockResolvedValue(mockProfitData);

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.ai.profitability({ month: "2026-05" });

    expect(getChannelProfitability).toHaveBeenCalledWith(1, "2026-05");
    expect(result.channels).toHaveLength(2);
  });

  it("returns empty data when no records exist", async () => {
    const { getChannelProfitability } = await import("./db");
    (getChannelProfitability as ReturnType<typeof vi.fn>).mockResolvedValue(emptyProfitData);

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.ai.profitability({ month: undefined });

    expect(result.totalSales).toBe(0);
    expect(result.channels).toHaveLength(0);
  });
});

describe("ai.analyzeChannels", () => {
  it("returns analysis text when data exists", async () => {
    const { getChannelProfitability } = await import("./db");
    (getChannelProfitability as ReturnType<typeof vi.fn>).mockResolvedValue(mockProfitData);

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.ai.analyzeChannels({ month: undefined });

    expect(result.analysis).toContain("Анализ");
    expect(result.data).toBeDefined();
    expect(result.data!.totalSales).toBe(15000);
  });

  it("returns fallback message when no data", async () => {
    const { getChannelProfitability } = await import("./db");
    (getChannelProfitability as ReturnType<typeof vi.fn>).mockResolvedValue(emptyProfitData);

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.ai.analyzeChannels({ month: undefined });

    expect(result.analysis).toContain("Нет данных");
  });
});

describe("ai.generateDigest", () => {
  it("returns digest text when data exists", async () => {
    const { getChannelProfitability } = await import("./db");
    (getChannelProfitability as ReturnType<typeof vi.fn>).mockResolvedValue(mockProfitData);

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.ai.generateDigest({ month: "2026-05" });

    expect(result.digest).toContain("Анализ");
    expect(result.data).toBeDefined();
  });

  it("returns fallback message when no data", async () => {
    const { getChannelProfitability } = await import("./db");
    (getChannelProfitability as ReturnType<typeof vi.fn>).mockResolvedValue(emptyProfitData);

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.ai.generateDigest({ month: undefined });

    expect(result.digest).toContain("Нет данных");
  });
});
