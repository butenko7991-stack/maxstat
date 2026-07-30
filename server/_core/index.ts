import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerLocalAuthRoutes } from "./localAuthRoutes";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
// serveStatic lives in its own file with NO vite/vite.config imports,
// so esbuild never pulls devDependencies into the production bundle.
import { serveStatic } from "./serveStatic";
import { externalReminderHandler } from "../scheduledHandlers";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);
  registerLocalAuthRoutes(app);

  // Scheduled job endpoints (called by Heartbeat cron)
  app.post("/api/scheduled/external-reminder", externalReminderHandler);

  // LLM Proxy endpoint - allows VPS (which can't reach Forge/OpenRouter from Russia) to proxy LLM calls
  app.post("/api/llm-proxy", async (req, res) => {
    const proxySecret = process.env.LLM_PROXY_SECRET;
    if (!proxySecret) {
      return res.status(503).json({ error: "LLM proxy not configured" });
    }
    const authHeader = req.headers["x-proxy-secret"];
    if (authHeader !== proxySecret) {
      return res.status(403).json({ error: "Invalid proxy secret" });
    }
    try {
      const { invokeLLM } = await import("./llm");
      const result = await invokeLLM(req.body);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  if (process.env.NODE_ENV === "development") {
    // setupVite is imported dynamically so vite.ts (and vite.config.ts with
    // all its devDependencies) is never evaluated at module load time.
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
