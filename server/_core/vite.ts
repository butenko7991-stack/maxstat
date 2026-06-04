import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import type { Express } from "express";

/**
 * Sets up Vite dev server middleware. Only called in development.
 * All vite imports are dynamic so esbuild never statically bundles
 * vite or vite.config.ts (which pulls in devDependencies) into
 * the production dist/index.js.
 */
export async function setupVite(app: Express, server: Server) {
  // Dynamic imports — vite and vite.config are devDependencies;
  // they must never be resolved at module load time in production.
  const { createServer: createViteServer } = await import("vite");
  const { default: viteConfig } = await import("../../vite.config");

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: {
      middlewareMode: true,
      hmr: { server },
      allowedHosts: true as const,
    },
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
