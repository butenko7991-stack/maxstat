import { describe, expect, it, vi } from "vitest";
import { withOptionalCreativeMatching } from "./creativeMatching";

describe("необязательное сопоставление креативов", () => {
  const posts = [{ channelTitle: "Первый", views24h: 1243 }, { channelTitle: "Второй", views24h: 2755 }];

  it("не теряет общий охват при ошибке БД креативов", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await withOptionalCreativeMatching(true, posts, async () => {
      throw new Error("creative storage unavailable");
    });
    expect(result).toBe(posts);
    expect(result.reduce((sum, item) => sum + item.views24h, 0)).toBe(3998);
    expect(warning).toHaveBeenCalledOnce();
    warning.mockRestore();
  });

  it("не обращается к креативам для продажи", async () => {
    const enrich = vi.fn(async () => []);
    expect(await withOptionalCreativeMatching(false, posts, enrich)).toBe(posts);
    expect(enrich).not.toHaveBeenCalled();
  });

  it("сохраняет успешное сопоставление", async () => {
    const matched = posts.map((p) => ({ ...p, creativeChannelId: 10 }));
    expect(await withOptionalCreativeMatching(true, posts, async () => matched)).toBe(matched);
  });
});
