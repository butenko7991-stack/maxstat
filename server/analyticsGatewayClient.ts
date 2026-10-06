import { ENV } from "./_core/env";

const DEFAULT_ANALYTICS_GATEWAY_URL = "https://maxadsmanag-m7risp4w.manus.space/api/analytics-fetch";

type GatewayPayload = {
  status?: unknown;
  contentType?: unknown;
  retryAfter?: unknown;
  body?: unknown;
};

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  return Object.fromEntries(new Headers(headers).entries());
}

export function resolveAnalyticsGatewayUrl(llmProxyUrl: string, explicitGatewayUrl = ""): string {
  if (explicitGatewayUrl) return explicitGatewayUrl;
  if (!llmProxyUrl) return "";
  try {
    const url = new URL(llmProxyUrl);
    if (url.pathname.endsWith("/api/llm-proxy")) {
      url.pathname = url.pathname.replace(/\/api\/llm-proxy$/, "/api/analytics-fetch");
      return url.toString();
    }
  } catch {
    // Keep the direct-request fallback for malformed optional configuration.
  }
  return "";
}

export function decodeAnalyticsGatewayResponse(payload: GatewayPayload): Response {
  const status = typeof payload.status === "number" && Number.isInteger(payload.status)
    ? payload.status
    : 502;
  const body = typeof payload.body === "string" ? payload.body : "";
  const headers = new Headers({
    "content-type": typeof payload.contentType === "string"
      ? payload.contentType
      : "text/plain; charset=utf-8",
  });
  if (typeof payload.retryAfter === "string" && payload.retryAfter) {
    headers.set("retry-after", payload.retryAfter);
  }
  return new Response(body, { status, headers });
}

class AnalyticsGatewayAuthError extends Error {}

export function parseAnalyticsGatewayEnvelope(status: number, contentType: string | null, payload: GatewayPayload): Response {
  if (typeof payload.status === "number" && typeof payload.body === "string") {
    // The gateway itself replied successfully, even when the source returned
    // 404/429. Preserve that source response; do not fetch the bot a second time.
    return decodeAnalyticsGatewayResponse(payload);
  }
  if (status === 401 || status === 403) {
    throw new AnalyticsGatewayAuthError("Шлюз отклонил ключ доступа; прямой запрос к источнику не выполнен");
  }
  throw new Error(`Analytics gateway returned HTTP ${status} (${contentType ?? "unknown"})`);
}

export async function probeAnalyticsGateway(): Promise<"not_configured" | "authorized" | "rejected" | "unreachable"> {
  if (!ENV.llmProxySecret) return "not_configured";
  const gatewayUrl = resolveAnalyticsGatewayUrl(
    ENV.llmProxyUrl,
    process.env.ANALYTICS_GATEWAY_URL ?? DEFAULT_ANALYTICS_GATEWAY_URL,
  );
  try {
    // Invalid address intentionally returns 400 *after* the secret is verified.
    // No report is fetched and no user data leaves the VPS.
    const response = await fetch(gatewayUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "x-proxy-secret": ENV.llmProxySecret },
      body: JSON.stringify({ url: "https://invalid.example" }),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 400) return "authorized";
    if (response.status === 401 || response.status === 403) return "rejected";
    return "unreachable";
  } catch {
    return "unreachable";
  }
}

/**
 * Requests public analytics reports through the managed gateway when the VPS
 * has the already configured LLM proxy credentials. A direct request remains
 * only as an availability fallback if the managed endpoint itself is offline.
 */
export async function fetchAnalyticsSource(url: string, init: RequestInit = {}): Promise<Response> {
  const gatewayUrl = resolveAnalyticsGatewayUrl(
    ENV.llmProxyUrl,
    process.env.ANALYTICS_GATEWAY_URL ?? DEFAULT_ANALYTICS_GATEWAY_URL,
  );
  if (!gatewayUrl || !ENV.llmProxySecret) return fetch(url, init);

  let body: string | undefined;
  if (typeof init.body === "string") body = init.body;
  else if (init.body !== undefined && init.body !== null) return fetch(url, init);

  try {
    const response = await fetch(gatewayUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-proxy-secret": ENV.llmProxySecret,
      },
      body: JSON.stringify({
        url,
        method: init.method ?? "GET",
        headers: headersToRecord(init.headers),
        body,
      }),
      // The relay can take longer than a direct read: do not use the original
      // 15-second source timeout for the extra server-to-server round trip.
      signal: AbortSignal.timeout(40_000),
    });
    const contentType = response.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      throw new Error(`Analytics gateway returned non-JSON (${response.status})`);
    }
    return parseAnalyticsGatewayEnvelope(response.status, contentType, await response.json() as GatewayPayload);
  } catch (error) {
    if (error instanceof AnalyticsGatewayAuthError) throw error;
    return fetch(url, init);
  }
}
