import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const { creative } = vi.hoisted(() => ({
  creative: {
    id: 7,
    userId: 1,
    channelId: 1,
    title: "Тестовый пост",
    postText: "Текст рекламного поста",
    imagePath: null,
    imageMime: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
}));

vi.mock("./db", () => ({
  getChannelById: vi.fn().mockResolvedValue({ id: 1, userId: 1, name: "Канал", description: null }),
  listChannelCreatives: vi.fn().mockResolvedValue([creative]),
  createChannelCreative: vi.fn().mockResolvedValue(7),
  getChannelCreativeById: vi.fn().mockResolvedValue(creative),
  deleteChannelCreative: vi.fn().mockResolvedValue(undefined),
  getDb: vi.fn(),
}));

vi.mock("./creativeUpload", () => ({
  saveCreativeImage: vi.fn(),
  removeCreativeImage: vi.fn().mockResolvedValue(undefined),
}));

function adminContext(): TrpcContext {
  const user = {
    id: 1,
    openId: "admin-local",
    name: "Администратор",
    email: "admin@example.test",
    loginMethod: "local",
    role: "admin" as const,
    teamOwnerId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    actorUser: user,
    workspaceId: 1,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("креативы канала", () => {
  it("показывает креативы только внутри указанного канала рабочей зоны", async () => {
    const caller = appRouter.createCaller(adminContext());
    await expect(caller.channels.creatives({ channelId: 1 })).resolves.toEqual([creative]);
  });

  it("сохраняет текстовый креатив и удаляет его только из своей рабочей зоны", async () => {
    const caller = appRouter.createCaller(adminContext());
    await expect(caller.channels.createCreative({ channelId: 1, postText: "Новый рекламный текст" })).resolves.toEqual({ id: 7, imagePath: null });
    await expect(caller.channels.deleteCreative({ id: 7 })).resolves.toEqual({ success: true });
  });
});
