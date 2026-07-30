export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  googleGeminiApiKey: process.env.GOOGLE_GEMINI_API_KEY ?? "",
  // LLM Proxy: VPS calls the Manus-hosted app as a proxy to reach Forge API
  llmProxyUrl: process.env.LLM_PROXY_URL ?? "", // e.g. https://maxadsmanag-m7risp4w.manus.space/api/llm-proxy
  llmProxySecret: process.env.LLM_PROXY_SECRET ?? "",
};
