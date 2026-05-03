import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB helpers ─────────────────────────────────────────────────────────

vi.mock("./db", () => ({
  getChannelsByUser: vi.fn().mockResolvedValue([
    { id: 1, userId: 1, name: "Твоя Алиса", description: null, createdAt: new Date(), updatedAt: new Date() },
  ]),
  getChannelById: vi.fn().mockResolvedValue({
    id: 1, userId: 1, name: "Твоя Алиса", description: null, createdAt: new Date(), updatedAt: new Date(),
  }),
  createChannel: vi.fn().mockResolvedValue(2),
  updateChannel: vi.fn().mockResolvedValue(undefined),
  deleteChannel: vi.fn().mockResolvedValue(undefined),
  getPurchaseRecords: vi.fn().mockResolvedValue([
    {
      id: 1, userId: 1, channelId: 1, date: new Date("2026-05-01"),
      admin: "Анна", link: "https://iimax.ru/test", targetChannels: null,
      direction: "психология", tariff: "1/48", buyer: "Лизка",
      spm: "1000СПМ", cost: "5000.00", paymentStatus: "paid",
      botStories: null, botStoriesCost: null, month: "2026-05", notes: null,
      createdAt: new Date(), updatedAt: new Date(),
    },
  ]),
  createPurchaseRecord: vi.fn().mockResolvedValue(10),
  updatePurchaseRecord: vi.fn().mockResolvedValue(undefined),
  deletePurchaseRecord: vi.fn().mockResolvedValue(undefined),
  getSaleRecords: vi.fn().mockResolvedValue([
    {
      id: 1, userId: 1, channelId: 1, date: new Date("2026-05-01"),
      admin: "Гоша", link: "https://iimax.ru/hitman", timeSlot: "обед",
      tariff: "1/48", platform: "Сетка", spm: "1000СПМ",
      cost: "1019.00", paymentStatus: "paid",
      botStories: null, botStoriesCost: null, month: "2026-05", notes: null,
      createdAt: new Date(), updatedAt: new Date(),
    },
  ]),
  createSaleRecord: vi.fn().mockResolvedValue(20),
  updateSaleRecord: vi.fn().mockResolvedValue(undefined),
  deleteSaleRecord: vi.fn().mockResolvedValue(undefined),
  getFinancialSummary: vi.fn().mockResolvedValue([
    {
      channelId: 1, channelName: "Твоя Алиса",
      totalPurchaseCost: 5000, totalSaleRevenue: 8000,
      profit: 3000, purchaseCount: 1, saleCount: 1,
    },
  ]),
  getAvailableMonths: vi.fn().mockResolvedValue(["2026-05", "2026-04"]),
  upsertUser: vi.fn().mockResolvedValue(undefined),
  getUserByOpenId: vi.fn().mockResolvedValue(undefined),
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

// ─── Channels ─────────────────────────────────────────────────────────────────

describe("channels", () => {
  it("lists channels for the user", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.channels.list();
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Твоя Алиса");
  });

  it("creates a new channel", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.channels.create({ name: "Новый канал" });
    expect(result.id).toBe(2);
  });

  it("updates an existing channel", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.channels.update({ id: 1, name: "Переименованный" });
    expect(result.success).toBe(true);
  });

  it("deletes a channel", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.channels.delete({ id: 1 });
    expect(result.success).toBe(true);
  });
});

// ─── Purchases ────────────────────────────────────────────────────────────────

describe("purchases", () => {
  it("lists purchase records", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.purchases.list({});
    expect(result).toHaveLength(1);
    expect(result[0]?.admin).toBe("Анна");
    expect(result[0]?.cost).toBe("5000.00");
  });

  it("creates a purchase record", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.purchases.create({
      channelId: 1,
      date: "2026-05-10",
      admin: "Тест",
      cost: "3000",
      paymentStatus: "unpaid",
      month: "2026-05",
    });
    expect(result.id).toBe(10);
  });

  it("deletes a purchase record", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.purchases.delete({ id: 1 });
    expect(result.success).toBe(true);
  });
});

// ─── Sales ────────────────────────────────────────────────────────────────────

describe("sales", () => {
  it("lists sale records", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.sales.list({});
    expect(result).toHaveLength(1);
    expect(result[0]?.timeSlot).toBe("обед");
    expect(result[0]?.cost).toBe("1019.00");
  });

  it("creates a sale record", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.sales.create({
      channelId: 1,
      date: "2026-05-10",
      admin: "Тест",
      timeSlot: "вечер",
      cost: "1500",
      paymentStatus: "paid",
      month: "2026-05",
    });
    expect(result.id).toBe(20);
  });

  it("deletes a sale record", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.sales.delete({ id: 1 });
    expect(result.success).toBe(true);
  });
});

// ─── Summary ──────────────────────────────────────────────────────────────────

describe("summary", () => {
  it("returns financial summary", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.summary.financial({});
    expect(result).toHaveLength(1);
    expect(result[0]?.channelName).toBe("Твоя Алиса");
    expect(result[0]?.profit).toBe(3000);
  });

  it("returns available months", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.summary.months();
    expect(result).toContain("2026-05");
    expect(result).toContain("2026-04");
  });
});
