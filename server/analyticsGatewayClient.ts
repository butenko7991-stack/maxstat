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
      signal: init.signal ?? AbortSignal.timeout(40_000),
    });

    if (!response.ok) {
      throw new Error(`Analytics gateway HTTP ${response.status}`);
    }
    return decodeAnalyticsGatewayResponse(await response.json() as GatewayPayload);
  } catch {
    return fetch(url, init);
  }
}
