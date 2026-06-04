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

  // Fall through to index.html for client-side routing
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
