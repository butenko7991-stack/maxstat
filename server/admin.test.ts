import { describe, it, expect, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB helpers ─────────────────────────────────────────────────────────

vi.mock("./db", () => ({
  getChannelsByUser: vi.fn().mockResolvedValue([
    { id: 1, userId: 1, name: "Канал 1", description: null },
    { id: 2, userId: 1, name: "Канал 2", description: null },
  ]),
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
  getAssignedChannelIds: vi.fn().mockResolvedValue([1]),
  upsertUser: vi.fn().mockResolvedValue(undefined),
  getUserByOpenId: vi.fn().mockResolvedValue(undefined),
  getChannelProfitability: vi.fn().mockResolvedValue({ totalSales: 0, totalPurchases: 0, totalProfit: 0, overallROI: 0, channelCount: 0, salesCount: 0, purchasesCount: 0, channels: [], topChannel: null, worstChannel: null }),
  getWorkspaceUsers: vi.fn().mockResolvedValue([
    { id: 1, openId: "admin-1", name: "Админ", email: "admin@test.com", role: "admin", createdAt: new Date(), lastSignedIn: new Date() },
    { id: 2, openId: "buyer-1", name: "Закупщик", email: "buyer@test.com", role: "buyer", createdAt: new Date(), lastSignedIn: new Date() },
    { id: 3, openId: "manager-1", name: "Менеджер", email: "mgr@test.com", role: "manager", createdAt: new Date(), lastSignedIn: new Date() },
  ]),
  createWorkspaceUser: vi.fn().mockResolvedValue({ id: 4 }),
  updateWorkspaceUserRole: vi.fn().mockResolvedValue(true),
  deleteWorkspaceUser: vi.fn().mockResolvedValue(true),
  getWorkspaceChannelAssignments: vi.fn().mockResolvedValue([
    { id: 1, userId: 2, channelId: 1, assignedBy: 1, createdAt: new Date(), userName: "Закупщик", userRole: "buyer", channelName: "Канал 1" },
  ]),
  getWorkspaceUserAssignments: vi.fn().mockResolvedValue([
    { id: 1, channelId: 1, channelName: "Канал 1" },
  ]),
  setWorkspaceUserChannelAssignments: vi.fn().mockResolvedValue(true),
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

function makeOwnerCtx(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "owner-1",
      email: "owner@test.com",
      name: "Владелец",
      loginMethod: "local",
      role: "owner",
      teamOwnerId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    workspaceId: 1,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function makeWorkspaceEmployeeCtx(role: "buyer" | "manager"): TrpcContext {
  const employee = {
    id: role === "buyer" ? 2 : 3,
    openId: `${role}-1`,
    email: `${role}@test.com`,
    name: role === "buyer" ? "Закупщик" : "Менеджер",
    loginMethod: "local",
    role,
    teamOwnerId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  } as NonNullable<TrpcContext["user"]>;

  return {
    user: employee,
    actorUser: employee,
    workspaceId: 1,
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
    await expect(caller.admin.updateRole({ userId: 3, role: "manager" })).rejects.toThrow("Доступ только для администраторов");
  });
});

describe("admin.createUser", () => {
  it("owner can create an independent admin", async () => {
    const caller = appRouter.createCaller(makeOwnerCtx());
    const result = await caller.admin.createUser({
      name: "Новый админ",
      email: "admin-new@test.com",
      password: "secure-test-password",
      role: "admin",
    });
    expect(result.id).toBe(4);
  });

  it("admin can create a buyer in their own workspace", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.admin.createUser({
      name: "Новый закупщик",
      email: "buyer-new@test.com",
      password: "secure-test-password",
      role: "buyer",
    });
    expect(result.id).toBe(4);
  });

  it("regular admin cannot create another admin", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    await expect(caller.admin.createUser({
      name: "Второй админ",
      email: "admin-new@test.com",
      password: "secure-test-password",
      role: "admin",
    })).rejects.toThrow("Администратор создаёт только закупщиков и менеджеров своей команды");
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

describe("P0: доступ сотрудников только к назначенным каналам", () => {
  it("передаёт в список каналов закупщика только его назначения", async () => {
    const caller = appRouter.createCaller(makeWorkspaceEmployeeCtx("buyer"));

    await caller.channels.list();

    const db = await import("./db");
    expect(db.getChannelsByUser).toHaveBeenLastCalledWith(1, [1]);
  });

  it("не позволяет закупщику читать закупки неназначенного канала", async () => {
    const caller = appRouter.createCaller(makeWorkspaceEmployeeCtx("buyer"));

    await expect(caller.purchases.list({ channelId: 2 })).rejects.toThrow(
      "Доступ к этому каналу не назначен"
    );
  });

  it("передаёт в список продаж менеджера только его назначения", async () => {
    const caller = appRouter.createCaller(makeWorkspaceEmployeeCtx("manager"));

    await caller.sales.list({});

    const db = await import("./db");
    expect(db.getSaleRecords).toHaveBeenLastCalledWith(1, {
      channelId: undefined,
      month: undefined,
      paymentStatus: undefined,
    }, [1]);
  });

  it("не позволяет менеджеру читать продажи неназначенного канала", async () => {
    const caller = appRouter.createCaller(makeWorkspaceEmployeeCtx("manager"));

    await expect(caller.sales.list({ channelId: 2 })).rejects.toThrow(
      "Доступ к этому каналу не назначен"
    );
  });

  it("не позволяет сотрудникам обращаться к сводным данным всей рабочей зоны", async () => {
    const buyer = appRouter.createCaller(makeWorkspaceEmployeeCtx("buyer"));
    const manager = appRouter.createCaller(makeWorkspaceEmployeeCtx("manager"));

    await expect(buyer.summary.financial({})).rejects.toThrow(
      "Доступ к общим данным рабочей зоны запрещён"
    );
    await expect(manager.expenses.list({})).rejects.toThrow(
      "Доступ к общим данным рабочей зоны запрещён"
    );
  });
});
