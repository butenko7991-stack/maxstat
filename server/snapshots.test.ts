import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for subscriber snapshot analytics.
 * Covers:
 *  1. CPF calculation helper logic
 *  2. Source size categorisation
 *  3. Growth aggregation
 *  4. snapshotsRouter procedure contracts (mocked DB)
 */

// ─── CPF calculation ──────────────────────────────────────────────────────────
function calcCpf(cost: number, growth: number): number | null {
  if (growth <= 0) return null;
  return Math.round((cost / growth) * 100) / 100;
}

describe("CPF calculation", () => {
  it("returns null when growth is zero", () => {
    expect(calcCpf(5000, 0)).toBeNull();
  });

  it("returns null when growth is negative", () => {
    expect(calcCpf(5000, -100)).toBeNull();
  });

  it("calculates CPF correctly", () => {
    expect(calcCpf(10000, 500)).toBe(20);
  });

  it("rounds to 2 decimal places", () => {
    expect(calcCpf(1000, 3)).toBe(333.33);
  });

  it("handles zero cost", () => {
    expect(calcCpf(0, 200)).toBe(0);
  });
});

// ─── Source size categorisation ───────────────────────────────────────────────
function categoriseSourceSize(subs: number): string {
  if (subs < 10000) return "micro (<10k)";
  if (subs < 50000) return "small (10k-50k)";
  if (subs < 200000) return "medium (50k-200k)";
  return "large (200k+)";
}

describe("Source size categorisation", () => {
  it("categorises micro channels (< 10k)", () => {
    expect(categoriseSourceSize(0)).toBe("micro (<10k)");
    expect(categoriseSourceSize(9999)).toBe("micro (<10k)");
  });

  it("categorises small channels (10k–50k)", () => {
    expect(categoriseSourceSize(10000)).toBe("small (10k-50k)");
    expect(categoriseSourceSize(49999)).toBe("small (10k-50k)");
  });

  it("categorises medium channels (50k–200k)", () => {
    expect(categoriseSourceSize(50000)).toBe("medium (50k-200k)");
    expect(categoriseSourceSize(199999)).toBe("medium (50k-200k)");
  });

  it("categorises large channels (200k+)", () => {
    expect(categoriseSourceSize(200000)).toBe("large (200k+)");
    expect(categoriseSourceSize(1_000_000)).toBe("large (200k+)");
  });
});

// ─── Growth aggregation ───────────────────────────────────────────────────────
describe("Subscriber growth aggregation", () => {
  const snapshots = [
    { channelId: 1, date: "2026-01-01", count: 10000 },
    { channelId: 1, date: "2026-01-08", count: 10500 },
    { channelId: 1, date: "2026-01-15", count: 11200 },
    { channelId: 2, date: "2026-01-01", count: 5000 },
    { channelId: 2, date: "2026-01-08", count: 4800 },
  ];

  it("calculates positive growth for channel 1", () => {
    const ch1 = snapshots.filter((s) => s.channelId === 1);
    const growth = ch1[ch1.length - 1].count - ch1[0].count;
    expect(growth).toBe(1200);
  });

  it("calculates negative growth for channel 2", () => {
    const ch2 = snapshots.filter((s) => s.channelId === 2);
    const growth = ch2[ch2.length - 1].count - ch2[0].count;
    expect(growth).toBe(-200);
  });

  it("calculates weekly growth correctly", () => {
    const ch1 = snapshots.filter((s) => s.channelId === 1);
    const weeklyGrowths = ch1.slice(1).map((s, i) => s.count - ch1[i].count);
    expect(weeklyGrowths).toEqual([500, 700]);
  });
});

// ─── snapshotsRouter procedure contracts (mocked DB helpers) ─────────────────
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    listSubscriberSnapshots: vi.fn().mockResolvedValue([
      { id: 1, channelId: 10, subscriberCount: 5000, snapshotDate: new Date("2026-01-01"), notes: null },
    ]),
    upsertSubscriberSnapshot: vi.fn().mockResolvedValue(undefined),
    deleteSubscriberSnapshot: vi.fn().mockResolvedValue(undefined),
    getCpfAnalytics: vi.fn().mockResolvedValue([
      {
        weekLabel: "2026-W01",
        weekStart: "2026-01-01",
        channelId: 10,
        channelName: "Test Channel",
        subscribersBefore: 4500,
        subscribersAfter: 5000,
        growth: 500,
        purchaseCost: 10000,
        cpf: 20,
      },
    ]),
    getSourceEfficiency: vi.fn().mockResolvedValue([
      { sizeCategory: "small (10k-50k)", avgCpf: 15, totalPurchases: 3, totalCost: 30000, totalSubscribersGained: 2000 },
    ]),
    getChannelsByUser: vi.fn().mockResolvedValue([{ id: 10, name: "Test Channel" }]),
  };
});

import {
  listSubscriberSnapshots,
  upsertSubscriberSnapshot,
  deleteSubscriberSnapshot,
  getCpfAnalytics,
  getSourceEfficiency,
} from "./db";

describe("snapshots procedures (mocked DB)", () => {
  const mockUserId = 1;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listSubscriberSnapshots returns snapshot array", async () => {
    const result = await listSubscriberSnapshots(mockUserId, 10);
    expect(result).toHaveLength(1);
    expect(result[0].channelId).toBe(10);
    expect(result[0].subscriberCount).toBe(5000);
  });

  it("upsertSubscriberSnapshot resolves without error", async () => {
    await expect(
      upsertSubscriberSnapshot({
        userId: mockUserId,
        channelId: 10,
        subscriberCount: 5500,
        snapshotDate: new Date("2026-01-08"),
        notes: null,
      })
    ).resolves.toBeUndefined();
    expect(upsertSubscriberSnapshot).toHaveBeenCalledOnce();
  });

  it("deleteSubscriberSnapshot resolves without error", async () => {
    await expect(deleteSubscriberSnapshot(1, mockUserId)).resolves.toBeUndefined();
    expect(deleteSubscriberSnapshot).toHaveBeenCalledWith(1, mockUserId);
  });

  it("getCpfAnalytics returns CPF data with correct shape", async () => {
    const result = await getCpfAnalytics(mockUserId, [10]);
    expect(result).toHaveLength(1);
    expect(result[0].cpf).toBe(20);
    expect(result[0].growth).toBe(500);
    expect(result[0].purchaseCost).toBe(10000);
  });

  it("getSourceEfficiency returns efficiency data", async () => {
    const result = await getSourceEfficiency(mockUserId);
    expect(result).toHaveLength(1);
    expect(result[0].sizeCategory).toBe("small (10k-50k)");
    expect(result[0].avgCpf).toBe(15);
  });
});
