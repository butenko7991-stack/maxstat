import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("AI analytics channel schema", () => {
  it("does not query the removed channels.isVisible column", () => {
    const dbSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
    expect(dbSource).not.toContain("channels.isVisible");
  });
});
