import { describe, it, expect, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB helpers ─────────────────────────────────────────────────────────

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
  getChannelProfitability: vi.fn().mockResolvedValue({ totalSales: 0, totalPurchases: 0, totalProfit: 0, overallROI: 0, channelCount: 0, salesCount: 0, purchasesCount: 0, channels: [], topChannel: null, worstChannel: null }),
  getAllUsers: vi.fn().mockResolvedValue([
    { id: 1, openId: "admin-1", name: "Админ", email: "admin@test.com", role: "admin", createdAt: new Date(), lastSignedIn: new Date() },
    { id: 2, openId: "buyer-1", name: "Закупщик", email: "buyer@test.com", role: "buyer", createdAt: new Date(), lastSignedIn: new Date() },
    { id: 3, openId: "manager-1", name: "Менеджер", email: "mgr@test.com", role: "manager", createdAt: new Date(), lastSignedIn: new Date() },
  ]),
  updateUserRole: vi.fn().mockResolvedValue(undefined),
  deleteUser: vi.fn().mockResolvedValue(undefined),
  getChannelAssignments: vi.fn().mockResolvedValue([
    { id: 1, userId: 2, channelId: 1, assignedBy: 1, createdAt: new Date(), userName: "Закупщик", userRole: "buyer", channelName: "Канал 1" },
  ]),
  getUserAssignments: vi.fn().mockResolvedValue([
    { id: 1, channelId: 1, channelName: "Канал 1" },
  ]),
  setUserChannelAssignments: vi.fn().mockResolvedValue(undefined),
  deleteChannelAssignment: vi.fn().mockResolvedValue(undefined),
  getAssignedChannelIds: vi.fn().mockResolvedValue([1, 2]),
  getAllChannels: vi.fn().mockResolvedValue([
    { id: 1, userId: 1, name: "Канал 1", description: null },
    { id: 2, userId: 1, name: "Канал 2", description: null },
  ]),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({ choices: [{ message: { role: "assistant", content: "test" } }] }),
}));

// ─── Contexts ────────────────────────────────────────────────────────────────

function makeAdminCtx(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "admin-1",
      email: "admin@test.com",
      name: "Админ",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function makeBuyerCtx(): TrpcContext {
  return {
    user: {
      id: 2,
      openId: "buyer-1",
      email: "buyer@test.com",
      name: "Закупщик",
      loginMethod: "manus",
      role: "buyer",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("admin.users", () => {
  it("admin can list all users", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.admin.users();
    expect(result).toHaveLength(3);
    expect(result[0].name).toBe("Админ");
  });

  it("non-admin cannot list users (FORBIDDEN)", async () => {
    const caller = appRouter.createCaller(makeBuyerCtx());
    await expect(caller.admin.users()).rejects.toThrow("Доступ только для администраторов");
  });
});

describe("admin.updateRole", () => {
  it("admin can update user role", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.admin.updateRole({ userId: 2, role: "manager" });
    expect(result.success).toBe(true);
  });

  it("non-admin cannot update roles", async () => {
    const caller = appRouter.createCaller(makeBuyerCtx());
    await expect(caller.admin.updateRole({ userId: 3, role: "user" })).rejects.toThrow("Доступ только для администраторов");
  });
});

describe("admin.deleteUser", () => {
  it("admin can delete a user", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.admin.deleteUser({ userId: 2 });
    expect(result.success).toBe(true);
  });

  it("non-admin cannot delete users", async () => {
    const caller = appRouter.createCaller(makeBuyerCtx());
    await expect(caller.admin.deleteUser({ userId: 3 })).rejects.toThrow("Доступ только для администраторов");
  });
});

describe("admin.assignments", () => {
  it("admin can list all assignments", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.admin.assignments();
    expect(result).toHaveLength(1);
    expect(result[0].channelName).toBe("Канал 1");
  });

  it("admin can get user assignments", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.admin.userAssignments({ userId: 2 });
    expect(result).toHaveLength(1);
  });

  it("admin can set assignments", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.admin.setAssignments({ userId: 2, channelIds: [1, 2] });
    expect(result.success).toBe(true);
  });

  it("admin can get all channels", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.admin.allChannels();
    expect(result).toHaveLength(2);
  });

  it("non-admin cannot access assignments", async () => {
    const caller = appRouter.createCaller(makeBuyerCtx());
    await expect(caller.admin.assignments()).rejects.toThrow("Доступ только для администраторов");
  });
});
