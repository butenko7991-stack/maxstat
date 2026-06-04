export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

declare global {
  interface Window {
    __ENV__?: {
      VITE_OAUTH_PORTAL_URL?: string;
      VITE_APP_ID?: string;
      VITE_FRONTEND_FORGE_API_URL?: string;
      VITE_FRONTEND_FORGE_API_KEY?: string;
    };
  }
}

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  // Fallbacks: import.meta.env (build-time) → window.__ENV__ (runtime) → hardcoded defaults
  const oauthPortalUrl =
    import.meta.env.VITE_OAUTH_PORTAL_URL ||
    window.__ENV__?.VITE_OAUTH_PORTAL_URL ||
    "https://manus.im";
  const appId =
    import.meta.env.VITE_APP_ID ||
    window.__ENV__?.VITE_APP_ID ||
    "m7risP4w4X9EeRX7Kf6EPq";
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId ?? "");
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};

