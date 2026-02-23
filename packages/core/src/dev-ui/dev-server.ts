import { createServer as createHttpServer } from "node:http";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import * as p from "@clack/prompts";
import { createWSServer, type WSClientMessage } from "./ws.js";
import { createWatcher } from "./watcher.js";
import type { PtyManager } from "./pty.js";
import { handleApiRequest } from "./api.js";
import { handleDeployRequest } from "./deploy-api.js";
import { createIntegrationProvider } from "../connections/integration-provider.js";
import { getSchemaName } from "../dbos.js";
import { getAppSchema } from "../cli/app.js";
import pg from "pg";

async function killPortHolder(port: number): Promise<boolean> {
  try {
    const pids = execSync(`lsof -ti :${port}`, { encoding: "utf-8" }).trim();
    if (pids) {
      for (const pid of pids.split("\n")) {
        process.kill(parseInt(pid, 10), "SIGTERM");
      }
      await new Promise((r) => setTimeout(r, 500));
      return true;
    }
  } catch {
    // no process on port or kill failed
  }
  return false;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export interface DevServerOptions {
  projectRoot: string;
  port?: number;
  host?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  databaseUrl?: string;
  nangoSecretKey?: string;
  claudePluginDir?: string;
  claudeSkipPermissions?: boolean;
  claudePrompt?: string;
}

export async function startDevServer(options: DevServerOptions) {
  const { projectRoot, port = 4173, host = false } = options;

  // Find package root (works from both src/ and dist/)
  let pkgRoot = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(resolve(pkgRoot, "package.json"))) {
    const parent = dirname(pkgRoot);
    if (parent === pkgRoot) break;
    pkgRoot = parent;
  }
  const clientDir = resolve(pkgRoot, "dist/dev-ui-client");

  // Read app schema from project's .env (DATABASE_SCHEMA, written by setup_app_schema)
  const projectPkgPath = resolve(projectRoot, "package.json");
  let pkgName: string | undefined;
  try {
    pkgName = JSON.parse(readFileSync(projectPkgPath, "utf-8")).name;
  } catch { /* use default */ }

  const appSchema = getAppSchema(projectRoot);
  const dbosSchema = getSchemaName(pkgName);

  // Set up API context if database is configured
  const hasApi = !!(options.databaseUrl);
  let pool: pg.Pool | null = null;

  if (hasApi) {
    pool = new pg.Pool({ connectionString: options.databaseUrl! });
  }

  // Integration provider auto-detects: NANGO_SECRET_KEY → local, otherwise → cloud
  const integrationProvider = await createIntegrationProvider(options.nangoSecretKey);

  const httpServer = createHttpServer(async (req, res) => {
    // Skip WebSocket upgrade requests
    if (req.headers.upgrade) return;

    const url = (req.url ?? "/").split("?")[0];

    // Deploy endpoint (no database required)
    if (url === "/api/deploy") {
      try {
        const handled = await handleDeployRequest(req, res, projectRoot);
        if (handled) return;
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }));
        return;
      }
    }

    // Route /api/* to API handler
    if (url.startsWith("/api/") && hasApi && pool) {
      try {
        const handled = await handleApiRequest(req, res, {
          pool,
          integrationProvider: integrationProvider!,
          schema: dbosSchema,
          appSchema,
          projectRoot,
        });
        if (handled) return;
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }));
        return;
      }
    }

    const filePath = url === "/" ? "index.html" : url.slice(1);
    const absPath = resolve(clientDir, filePath);

    try {
      const body = await readFile(absPath);
      const ext = extname(absPath);
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(body);
    } catch {
      // SPA fallback — serve index.html for unmatched routes
      try {
        const indexBody = await readFile(resolve(clientDir, "index.html"));
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(indexBody);
      } catch {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Dev UI client not built. Run: pnpm --filter 0pflow build");
      }
    }
  });

  // Set up PTY manager for embedded Claude Code terminal
  let ptyManager: PtyManager | null = null;

  const onClientMessage = (_ws: import("ws").WebSocket, msg: WSClientMessage) => {
    if (!ptyManager) return;
    switch (msg.type) {
      case "pty-input":
        ptyManager.write(msg.data);
        break;
      case "pty-resize":
        ptyManager.resize(msg.data.cols, msg.data.rows);
        break;
      case "pty-spawn":
        if (!ptyManager.isAlive()) {
          const pid = ptyManager.spawn();
          broadcast({ type: "pty-spawned", data: { pid } });
        }
        break;
    }
  };

  const { broadcast, sendTo, wss } = createWSServer(httpServer, onClientMessage);
  wss.on("error", () => {}); // errors handled on httpServer

  try {
    const { createPtyManager } = await import("./pty.js");
    ptyManager = createPtyManager({
      projectRoot,
      claudeArgs: [
        ...(options.claudePluginDir ? ["--plugin-dir", options.claudePluginDir] : []),
        ...(options.claudeSkipPermissions ? ["--dangerously-skip-permissions"] : []),
        ...(options.claudePrompt ? ["--", options.claudePrompt] : []),
      ],
      onData: (data) => broadcast({ type: "pty-data", data }),
      onExit: (code) => broadcast({ type: "pty-exit", data: { code } }),
    });
  } catch {
    if (!options.quiet) {
      console.log("  Terminal: unavailable (node-pty not installed)\n");
    }
  }

  // Create file watcher that broadcasts changes
  const watcher = createWatcher({
    projectRoot,
    onMessage: (msg) => broadcast(msg),
  });

  // Auto-spawn Claude Code PTY
  if (ptyManager) {
    try {
      const pid = ptyManager.spawn();
      if (options.verbose) {
        console.log(`  Terminal: Claude Code running (PID ${pid})\n`);
      }
    } catch (err) {
      if (!options.quiet) {
        console.log(`  Terminal: failed to spawn claude (${err instanceof Error ? err.message : err})\n`);
      }
      ptyManager = null;
    }
  }

  // On new WS connection, wait for initial scan then send full state
  wss.on("connection", async (ws) => {
    await watcher.waitForReady();
    sendTo(ws, { type: "full-sync", data: watcher.getState() });

    // Send existing terminal scrollback to new clients
    if (ptyManager?.isAlive()) {
      const scrollback = ptyManager.getScrollback();
      if (scrollback) {
        sendTo(ws, { type: "pty-data", data: scrollback });
      }
      sendTo(ws, { type: "pty-spawned", data: { pid: 0 } });
    }
  });

  const hostname = host ? "0.0.0.0" : "localhost";

  // Try the requested port; offer to kill existing instance if taken
  const actualPort = await new Promise<number>((resolvePromise, rejectPromise) => {
    httpServer.once("error", async (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        const shouldKill = await p.confirm({
          message: "0pflow is likely already running. Kill it and restart?",
        });
        if (!p.isCancel(shouldKill) && shouldKill) {
          const killed = await killPortHolder(port);
          if (killed) {
            httpServer.listen(port, hostname, () => resolvePromise(port));
            return;
          }
        }
        // Fall back to OS-assigned port
        httpServer.listen(0, hostname, () => {
          const addr = httpServer.address();
          resolvePromise(typeof addr === "object" && addr ? addr.port : 0);
        });
      } else {
        rejectPromise(err);
      }
    });
    httpServer.listen(port, hostname, () => {
      resolvePromise(port);
    });
  });

  const url = `http://localhost:${actualPort}`;

  if (!options.quiet) {
    console.log(`\n  Open your browser to ${url}\n`);
    if (actualPort !== port) {
      console.log(`  (port ${port} was in use, using ${actualPort} instead)\n`);
    }
    if (options.verbose) {
      console.log(`  Watching for workflow changes in:`);
      console.log(`    ${resolve(projectRoot, "generated/workflows/")}`);
      console.log(`    ${resolve(projectRoot, "src/workflows/")}\n`);
      if (hasApi) {
        console.log(`  Connections API enabled (Nango + DB configured)\n`);
      } else {
        console.log(`  Connections API disabled (set DATABASE_URL and NANGO_SECRET_KEY to enable)\n`);
      }
    }
  }

  const cleanup = async () => {
    ptyManager?.kill();
    if (pool) {
      await pool.end();
    }
    await watcher.close();
    httpServer.close();
  };

  process.on("SIGINT", async () => {
    await cleanup();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await cleanup();
    process.exit(0);
  });

  return { cleanup, port: actualPort, url };
}
