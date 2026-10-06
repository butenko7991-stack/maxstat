import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import { getPurchaseReach24h } from "../client/src/lib/reachExtraction";
import { fetchAnalyticsSource } from "./analyticsGatewayClient";
import { getPurchaseById, listWorkspaceCreatives, updatePurchaseRecord } from "./db";
import type { TrpcContext } from "./_core/context";

vi.mock("./analyticsGatewayClient", () => ({ fetchAnalyticsSource: vi.fn() }));
vi.mock("./db", () => ({
  getPurchaseById: vi.fn(),
  updatePurchaseRecord: vi.fn(),
  listWorkspaceCreatives: vi.fn(),
}));

const REPORT_URL = "https://go.xn----7sbaab9baqgpd7d3b.xn--p1ai/ad/ad_-73630722384050_1789289805425_4gvpuu";

function ctx(): TrpcContext {
  return {
    user: {
      id: 1, openId: "test-owner", email: "owner@example.test", name: "Владелец",
      loginMethod: "local", role: "owner", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("извлечение общего охвата МАХ без необязательного OCR", () => {
  it("получает 569 за 24 часа по ссылке пользователя и сохраняет охват закупа", async () => {
    vi.mocked(fetchAnalyticsSource).mockResolvedValue(new Response(JSON.stringify({
      channels: [{ channelTitle: "Тестовый канал", views: 687, views24: 569, reportAfter: 24 }],
      totals: { channels: 1, views: 687, views24: 569 },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.mocked(getPurchaseById).mockResolvedValue({ id: 42, userId: 1, channelId: 2 } as never);
    vi.mocked(updatePurchaseRecord).mockResolvedValue(undefined as never);
    vi.mocked(listWorkspaceCreatives).mockRejectedValue(new Error("OCR should not run"));

    const caller = appRouter.createCaller(ctx());
    const report = await caller.ocr.analyzeLink({ url: REPORT_URL, recordType: "purchase", skipCreativeMatching: true });
    const reach = getPurchaseReach24h(report);
    expect(report.summary.views24h).toBe(569);
    expect(reach).toBe(569);
    expect(listWorkspaceCreatives).not.toHaveBeenCalled();
    await caller.purchases.update({ id: 42, reach: reach! });
    expect(updatePurchaseRecord).toHaveBeenCalledWith(42, 1, { reach: 569 }, undefined);
  });
});
