import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const server = readFileSync(resolve(import.meta.dirname, "_core/index.ts"), "utf8");

describe("операционная диагностика шлюза", () => {
  it("не возвращает секрет в публичном статусе", () => {
    expect(server).toContain('app.get("/api/analytics-gateway-ready"');
    expect(server).toContain('res.status(ready ? 200 : 503).json({ ready })');
    expect(server).toContain('app.get("/api/analytics-gateway-probe"');
    expect(server).toContain('res.status(outcome === "authorized" ? 200 : 503).json({ outcome })');
  });
});
