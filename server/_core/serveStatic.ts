import express, { type Express } from "express";
import fs from "fs";
import path from "path";

/**
 * Serves the pre-built Vite frontend from dist/public in production.
 * This file intentionally has NO vite imports so esbuild never pulls
 * vite.config.ts (and its devDependencies) into the production bundle.
 */
export function serveStatic(app: Express) {
  // In production the bundle lives at dist/index.js, so import.meta.dirname
  // resolves to /app/dist — and the frontend is at /app/dist/public.
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // Fall through to index.html for client-side routing.
  // Inject a <script> that exposes runtime env vars as window.__ENV__ so the
  // frontend can read them even though they weren't available at Vite build time.
  app.use("*", (_req, res) => {
    const indexPath = path.resolve(distPath, "index.html");
    fs.readFile(indexPath, "utf-8", (err, html) => {
      if (err) {
        res.status(500).send("Could not load index.html");
        return;
      }

      const env = {
        VITE_OAUTH_PORTAL_URL: process.env.VITE_OAUTH_PORTAL_URL ?? "",
        VITE_APP_ID: process.env.VITE_APP_ID ?? "",
        VITE_FRONTEND_FORGE_API_URL:
          process.env.VITE_FRONTEND_FORGE_API_URL ?? "",
        VITE_FRONTEND_FORGE_API_KEY:
          process.env.VITE_FRONTEND_FORGE_API_KEY ?? "",
      };

      const injectedScript = `<script>window.__ENV__ = ${JSON.stringify(env)};</script>`;
      const injectedHtml = html.replace("</head>", `${injectedScript}\n</head>`);

      res.setHeader("Content-Type", "text/html");
      res.send(injectedHtml);
    });
  });
}
