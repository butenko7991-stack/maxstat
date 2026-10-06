import { describe, expect, it } from "vitest";
import { decodeAnalyticsGatewayResponse, resolveAnalyticsGatewayUrl } from "./analyticsGatewayClient";

describe("клиент шлюза аналитики", () => {
  it("строит endpoint аналитики из уже настроенного LLM-прокси", () => {
    expect(resolveAnalyticsGatewayUrl(
      "https://maxadsmanag-m7risp4w.manus.space/api/llm-proxy",
    )).toBe("https://maxadsmanag-m7risp4w.manus.space/api/analytics-fetch");
  });

  it("приоритетно использует явно заданный endpoint", () => {
    expect(resolveAnalyticsGatewayUrl(
      "https://example.com/api/llm-proxy",
      "https://analytics-proxy.example/api/fetch",
    )).toBe("https://analytics-proxy.example/api/fetch");
  });

  it("не создаёт фиктивный endpoint из некорректной конфигурации", () => {
    expect(resolveAnalyticsGatewayUrl("not a URL")).toBe("");
  });

  it("сохраняет статус, текст отчёта и Retry-After из ответа шлюза", async () => {
    const response = decodeAnalyticsGatewayResponse({
      status: 429,
      contentType: "text/html; charset=utf-8",
      retryAfter: "30",
      body: "rate limited",
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("retry-after")).toBe("30");
    await expect(response.text()).resolves.toBe("rate limited");
  });
});
