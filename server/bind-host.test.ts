import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const serverSource = readFileSync(
  resolve(process.cwd(), "server/_core/index.ts"),
  "utf8"
);

describe("безопасная привязка HTTP-сервера", () => {
  it("позволяет задать адрес привязки через BIND_HOST", () => {
    expect(serverSource).toContain('const bindHost = process.env.BIND_HOST || undefined;');
    expect(serverSource).toContain("server.listen(port, bindHost");
  });
});
